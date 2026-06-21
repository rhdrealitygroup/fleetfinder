// POST /api/live-search — live inventory search.
// Tries Auto.dev first (free tier), falls back to MarketCheck on rate-limit
// or error. Returns up to 50 results (one page). Ported from Base44.

import { NextResponse } from "next/server";
import {
  MC_HOST, AUTO_DEV_HOST, DEFAULT_LAT, DEFAULT_LNG, RADIUS_MILES,
  PAGE_SIZE, num, mcListing, adListing, mcKey, autoDevKey,
  resolveModel, decodeVinOptionNames, phraseMatch, fetchWithTimeout, estMonthlyCard, type UnifiedVehicle,
} from "@/lib/marketcheck";
import { cacheGet, cacheSet, HOUR } from "@/lib/memoryCache";
import { requireActivePlan } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// This route can decode many VINs for option filtering; give it headroom.
export const maxDuration = 60;

// Results fetched per search. MarketCheck/Auto.dev pages are PAGE_SIZE (50) rows,
// so 150 = 3 pages — enough breadth for brokers without rendering thousands of
// cards or making 30 sequential upstream calls.
const SEARCH_LIMIT = 150;

function summarize(body: any) {
  const base = [
    body.year_min && `${body.year_min}+`, body.make, body.model, body.trim, body.body_type,
    body.drivetrain, body.powertrain_type, body.exterior_color,
    body.price_max && `≤$${body.price_max}`, body.miles_max && `<${body.miles_max}mi`,
  ].filter(Boolean).join(" ") || "all new cars";
  const loc = body.zip ? ` · within ${Math.min(500, Number(body.radius) || 100)}mi of ${body.zip}` : "";
  return base + loc;
}

function cacheKeyFor(body: any) {
  const norm = {
    car_type: body.car_type || "new",
    vin: (body.vin || "").toUpperCase(),
    make: (body.make || "").toLowerCase(),
    model: (body.model || "").toLowerCase(),
    trim: (body.trim || "").toLowerCase(),
    year_min: body.year_min || null, year_max: body.year_max || null,
    price_min: body.price_min || null, price_max: body.price_max || null,
    miles_max: body.miles_max || null,
    variant: (body.variant || "").toLowerCase(),
    powertrain_type: body.powertrain_type || "", body_type: body.body_type || "",
    drivetrain: body.drivetrain || "", exterior_color: body.exterior_color || "", interior_color: body.interior_color || "",
    features: Array.isArray(body.features) ? [...body.features].sort() : [],
    max_monthly: Number(body.max_monthly) || 0,
    option_query: (body.option_query || "").toString().trim().toLowerCase(),
    option_names: Array.isArray(body.option_names) ? [...body.option_names].map((s) => String(s).toLowerCase()).sort() : [],
    dealer_ids: Array.isArray(body.dealer_ids) ? [...body.dealer_ids].map(String).sort() : [],
    zip: (body.zip || "").toString().trim(),
    // radius/lat/lng only matter for a located search — for a true nationwide
    // query they're unused, so keep them out of the key (avoids a separate cache
    // entry per radius for identical nationwide results).
    radius: (body.zip || (body.latitude && body.longitude)) ? Math.min(500, Number(body.radius) || 100) : 0,
    lat: (body.latitude && body.longitude) ? Math.round(Number(body.latitude) * 10) / 10 : 0,
    lng: (body.latitude && body.longitude) ? Math.round(Number(body.longitude) * 10) / 10 : 0,
  };
  return "search::" + JSON.stringify(norm);
}

export async function POST(req: Request) {
  // Whole-request wall-clock anchor (maxDuration=60). Used to bound the option
  // decode loop RELATIVE TO REQUEST START — not the start of the decode block —
  // so slow MarketCheck pagination beforehand can't push the deadline past 60s.
  const reqStart = Date.now();
  // Defense-in-depth: this endpoint spends paid API quota, so require a session
  // AND an active plan directly (not just the proxy gate / billing UI).
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const autoKey = autoDevKey();
  const marketKey = mcKey();
  if (!autoKey && !marketKey) {
    return NextResponse.json({ error: "No search API key configured" }, { status: 500 });
  }

  // Resolve to MarketCheck's model string so brands like RAM (catalog "1500"
  // → MC "Ram 1500 Pickup") actually return results instead of zero.
  const mcModel = body.model && marketKey ? await resolveModel(body.make, body.model) : body.model;

  // Customer location: search around their ZIP. Radius is capped at 100mi
  // (MarketCheck Free-tier limit). Falls back to a default center when blank.
  const zip = String(body.zip || "").trim();
  const radius = Math.min(500, Number(body.radius) || RADIUS_MILES);

  // Dealer scoping: MarketCheck's `dealer_id` filter on the standard search
  // returns a COUNT but NO listings unless the (separately-priced) Dealer
  // Inventory API is entitled — which is why dealer-scoped searches came back
  // empty. The reliable filter on the standard endpoint is `source` (the
  // dealer's website domain), same as the inventory deep-pull. Resolve the
  // selected dealer IDs to their domains here.
  let dealerSources: string[] = [];
  const dealerScoped = Array.isArray(body.dealer_ids) && body.dealer_ids.length > 0;
  if (marketKey && dealerScoped) {
    try {
      const db = createServiceRoleClient();
      const { data } = await db.from("dealer_catalog").select("website")
        .in("id", body.dealer_ids.map(String).slice(0, 400));
      dealerSources = [...new Set((data || [])
        .map((d: { website?: string }) => String(d.website || "")
          .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim().toLowerCase())
        .filter(Boolean))];
    } catch { /* fall through; the empty-guard below prevents an unscoped search */ }
  }
  // Guard: a dealer-scoped search whose dealers resolved to NO domains must
  // return nothing — never silently fall back to an unscoped (all-inventory)
  // search.
  if (dealerScoped && !dealerSources.length) {
    return NextResponse.json({ results: [], total: 0, provider: "marketcheck", truncated: false,
      note: " (selected dealers have no resolvable inventory source)", cached: false, query: summarize(body) });
  }

  // TEMP DEBUG: probe which MarketCheck dealer param actually returns listings.
  if (body._dealerdebug && marketKey && dealerSources.length) {
    const probe = async (extra: Record<string, string>) => {
      const u = new URL(`${MC_HOST}/search/car/active`);
      u.searchParams.set("api_key", marketKey);
      u.searchParams.set("car_type", "new");
      u.searchParams.set("source", dealerSources.join(","));
      u.searchParams.set("rows", "3");
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
      const r = await fetchWithTimeout(u.toString()).catch(() => null);
      if (!r) return { err: "fetch" };
      if (!r.ok) return { status: r.status, body: (await r.text().catch(() => "")).slice(0, 200) };
      const d: any = await r.json().catch(() => ({}));
      return { num_found: d.num_found, listings: (d.listings || []).length };
    };
    const did = async (extra: Record<string, string>) => {
      const u = new URL(`${MC_HOST}/search/car/active`);
      u.searchParams.set("api_key", marketKey);
      u.searchParams.set("car_type", "new");
      u.searchParams.set("dealer_id", "1007942");
      u.searchParams.set("rows", "3");
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
      const r = await fetchWithTimeout(u.toString()).catch(() => null);
      if (!r || !r.ok) return { status: r?.status };
      const d: any = await r.json().catch(() => ({}));
      return { num_found: d.num_found, listings: (d.listings || []).length };
    };
    return NextResponse.json({
      host: MC_HOST, sources: dealerSources,
      source_plain: await probe({}),
      source_owned: await probe({ owned: "true" }),
      source_nodedup: await probe({ nodedup: "true" }),
      source_include_non_vin: await probe({ include_non_vin_listings: "true" }),
      dealer_id_plain: await did({}),
      dealer_id_owned: await did({ owned: "true" }),
    });
  }

  // ── Cache check (1h) ────────────────────────────────────────────────────
  const ckey = cacheKeyFor(body);
  if (!body.fresh) {
    const hit = cacheGet<{ results: UnifiedVehicle[]; total: number; provider: string }>(ckey);
    if (hit) {
      return NextResponse.json({ ...hit, cached: true, query: summarize(body) });
    }
  }

  async function searchMarketCheck() {
    const out: any[] = [];
    let total = 0;
    for (let page = 0; page * PAGE_SIZE < SEARCH_LIMIT; page++) {
      // Stop paging if we're near the function's time budget — a slow upstream over
      // ~15 sequential pages could otherwise blow maxDuration and 504. Keep what we
      // collected so far (the truncated note still fires downstream).
      if (page > 0 && Date.now() > reqStart + 47_000) break;
      const url = new URL(`${MC_HOST}/search/car/active`);
      url.searchParams.set("api_key", marketKey);
      url.searchParams.set("car_type", body.car_type || "new");
      // ZIP → local (geocoded), explicit lat/lng → local, neither → nationwide.
      // The Basic MarketCheck tier allows unbounded nationwide queries; on those
      // we skip radius + distance sort (there's no center to measure from).
      const hasGeo = !!zip || !!body.latitude;
      if (zip) {
        url.searchParams.set("zip", zip);
      } else if (body.latitude) {
        url.searchParams.set("latitude", String(body.latitude));
        url.searchParams.set("longitude", String(body.longitude));
      }
      if (hasGeo) {
        url.searchParams.set("radius", String(radius));
        url.searchParams.set("sort_by", "distance");
        url.searchParams.set("sort_order", "asc");
      }
      if (body.vin) url.searchParams.set("vin", String(body.vin).toUpperCase().trim());
      if (body.make) url.searchParams.set("make", body.make);
      if (mcModel) url.searchParams.set("model", mcModel);
      if (body.trim) url.searchParams.set("trim", body.trim);
      // Open-ended floor (1900) when only an upper bound is given — defaulting the
      // floor to 2020 produced an inverted range (e.g. "used up to 2019" → 2020-2019).
      if (body.year_min || body.year_max) url.searchParams.set("year_range", `${body.year_min || 1900}-${body.year_max || new Date().getFullYear() + 1}`);
      if (body.price_min || body.price_max) url.searchParams.set("price_range", `${body.price_min || 0}-${body.price_max || 999999}`);
      if (body.miles_max) url.searchParams.set("miles_range", `0-${body.miles_max}`);
      if (body.powertrain_type) url.searchParams.set("powertrain_type", body.powertrain_type);
      if (body.body_type) url.searchParams.set("body_type", body.body_type);
      if (body.drivetrain) url.searchParams.set("drivetrain", body.drivetrain);
      // exterior_color matches the full color string and accepts a comma-OR
      // list (e.g. "Agate Black,Agate Black Metallic") from the color picker.
      if (body.exterior_color) url.searchParams.set("exterior_color", body.exterior_color);
      if (body.interior_color) url.searchParams.set("interior_color", body.interior_color);
      if (Array.isArray(body.features) && body.features.length) url.searchParams.set("high_value_features", body.features.join(","));
      // Scope to the company's selected dealers (MarketCheck OR-list of IDs).
      // Sort BEFORE slicing so the searched first-200 subset matches the
      // (sorted) cache key — otherwise an org with >200 dealers could be served a
      // cached result computed from a different 200-dealer subset.
      // Filter by dealer website domain (the reliable per-dealer filter); the
      // MarketCheck `source` OR-list is capped at 200.
      if (dealerSources.length) url.searchParams.set("source", [...dealerSources].sort().slice(0, 200).join(","));
      url.searchParams.set("rows", String(PAGE_SIZE));
      url.searchParams.set("start", String(page * PAGE_SIZE));
      let res: Response;
      try { res = await fetchWithTimeout(url.toString()); }
      catch { if (out.length > 0) break; throw new Error("MarketCheck request timed out"); }
      if (res.status === 429) return { results: out.map(mcListing), total, rateLimited: true };
      if (!res.ok) {
        // Past page 0 (e.g. the tier's 1500 start-offset cap) — keep the results
        // already collected instead of throwing the whole search away.
        if (out.length > 0) break;
        const b = await res.text().catch(() => "");
        throw new Error(`MarketCheck ${res.status}: ${b.slice(0, 150)}`);
      }
      const data = await res.json();
      total = num(data.num_found) || total;
      const list: any[] = data.listings || [];
      out.push(...list);
      if (list.length < PAGE_SIZE) break;
    }
    return { results: out.map(mcListing), total, rateLimited: false };
  }

  async function searchAutoDev() {
    const out: any[] = [];
    let total = 0;
    for (let page = 1; (page - 1) * PAGE_SIZE < SEARCH_LIMIT; page++) {
      if (page > 1 && Date.now() > reqStart + 47_000) break; // near time budget → stop paging
      const url = new URL(`${AUTO_DEV_HOST}/listings`);
      url.searchParams.set("retailListing.used", body.car_type === "used" ? "true" : "false");
      if (body.vin) url.searchParams.set("vin", String(body.vin).toUpperCase().trim());
      if (body.make) url.searchParams.set("vehicle.make", body.make);
      if (body.model) url.searchParams.set("vehicle.model", body.model);
      if (body.trim) url.searchParams.set("vehicle.trim", body.trim);
      if (body.year_min || body.year_max) url.searchParams.set("vehicle.year", `${body.year_min || 1900}-${body.year_max || new Date().getFullYear() + 1}`);
      if (body.price_min || body.price_max) url.searchParams.set("retailListing.price", `${body.price_min || 0}-${body.price_max || 999999}`);
      if (body.miles_max) url.searchParams.set("retailListing.miles", `0-${body.miles_max}`);
      if (body.body_type) url.searchParams.set("vehicle.bodyStyle", body.body_type);
      if (body.drivetrain) url.searchParams.set("vehicle.drivetrain", body.drivetrain);
      if (body.exterior_color) url.searchParams.set("vehicle.exteriorColor", body.exterior_color);
      // Auto.dev needs real coordinates — it has no ZIP param. Only constrain by
      // location when explicit lat/lng exist; a ZIP-only search is handled by
      // autoDevCantHonor above (we never reach a serving Auto.dev call for it), so
      // here a missing lat/lng means a true nationwide search → no center/radius.
      const hasGeo = !!(body.latitude && body.longitude);
      if (hasGeo) {
        url.searchParams.set("latitude", String(body.latitude || DEFAULT_LAT));
        url.searchParams.set("longitude", String(body.longitude || DEFAULT_LNG));
        url.searchParams.set("radius", String(radius));
      }
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));
      let res: Response;
      try { res = await fetchWithTimeout(url.toString(), { headers: { Authorization: `Bearer ${autoKey}` } }); }
      catch { if (out.length > 0) break; throw new Error("Auto.dev request timed out"); }
      if (res.status === 429) return { results: out.map(adListing), total, rateLimited: true };
      if (!res.ok) {
        if (out.length > 0) break; // keep what we have past page 0
        const b = await res.text().catch(() => "");
        throw new Error(`Auto.dev ${res.status}: ${b.slice(0, 150)}`);
      }
      const data = await res.json();
      total = num(data.total || data?.meta?.total) || total;
      const list: any[] = data.data || data.listings || [];
      out.push(...list);
      if (list.length < PAGE_SIZE) break;
    }
    return { results: out.map(adListing), total, rateLimited: false };
  }

  let results: UnifiedVehicle[] = [];
  let total = 0;
  let provider = "";
  let note = "";
  let rateLimited = false;
  let mcTried = false; // did we already attempt MarketCheck? (don't retry it in the catch)
  // Prefer MarketCheck whenever we have a key: it geocodes ZIPs natively AND
  // (on the Basic tier) handles unbounded nationwide queries. Auto.dev is the
  // fallback, used only if MarketCheck is unavailable or rate-limited.
  const preferMarketCheck = !!marketKey;
  // Filters Auto.dev cannot honor (no API param + no client-side post-filter):
  // dealer scope, interior color, AND a ZIP with no resolved lat/lng (Auto.dev has
  // no ZIP param and we have no geocoder, so it would silently center on the
  // default NJ coords). For any of these, don't serve/cache an Auto.dev result.
  const autoDevCantHonor = (Array.isArray(body.dealer_ids) && body.dealer_ids.length > 0)
    || !!body.interior_color
    || !!body.powertrain_type
    || (!!body.zip && !(body.latitude && body.longitude));
  try {
    if (preferMarketCheck) {
      mcTried = true;
      const r = await searchMarketCheck();
      results = r.results; total = r.total; provider = "marketcheck"; rateLimited = r.rateLimited;
      if (r.rateLimited) {
        // A 429 returns empty rather than throwing, so fall back to Auto.dev when
        // available — otherwise the UI shows a rate-limit as "no inventory" and
        // sends the agent chasing filters that are actually fine.
        // BUT NOT when the search needs a filter Auto.dev can't honor: dealer_id
        // (no dealer filter) or interior_color (no interior filter + no client-side
        // post-filter). Falling back there would return inventory that ignores the
        // filter and cache it under the filter-specific key. Keep rateLimited=true
        // (so nothing is cached) and just surface the rate-limit note.
        if (autoKey && !autoDevCantHonor) {
          try {
            const r2 = await searchAutoDev();
            results = r2.results; total = r2.total; provider = "auto.dev"; rateLimited = r2.rateLimited;
            note = " (marketcheck rate-limited, used auto.dev)";
          } catch { note = " (inventory service rate-limited — try again shortly)"; }
        } else {
          note = " (inventory service rate-limited — try again shortly)";
        }
      }
    } else if (autoKey) {
      // Auto.dev-only deployment (no MarketCheck key). Auto.dev can't filter by
      // dealer_id or interior_color and we have no post-filter for them, so for
      // such a search return nothing with a clear note rather than silently
      // serving (and caching) an unfiltered set.
      if (autoDevCantHonor) {
        results = []; total = 0; provider = "auto.dev"; rateLimited = true;
        note = " (this filter needs MarketCheck — not available in this configuration)";
      } else {
        const r = await searchAutoDev();
        results = r.results; total = r.total; provider = "auto.dev"; rateLimited = r.rateLimited;
        if (r.rateLimited) note = " (inventory service rate-limited — try again shortly)";
      }
    } else if (marketKey) {
      mcTried = true;
      const r = await searchMarketCheck();
      results = r.results; total = r.total; provider = "marketcheck"; rateLimited = r.rateLimited;
    }
  } catch (e) {
    // Cross-provider fallback on a HARD failure (timeout/5xx/malformed), not just
    // a 429. If MarketCheck threw and Auto.dev can honor this search, use it
    // (mirrors the rate-limit fallback). If Auto.dev threw and MarketCheck exists,
    // try MarketCheck. Otherwise surface the error.
    if (provider !== "auto.dev" && autoKey && !autoDevCantHonor) {
      try {
        const r = await searchAutoDev();
        results = r.results; total = r.total; provider = "auto.dev"; rateLimited = r.rateLimited;
        note = " (marketcheck unavailable, used auto.dev)";
      } catch {
        return NextResponse.json({ error: (e as Error).message }, { status: 502 });
      }
    } else if (provider !== "marketcheck" && marketKey && !mcTried) {
      // Only retry MarketCheck if we HADN'T already tried it (i.e. Auto.dev was the
      // failing primary). Re-running the MarketCheck that just hard-failed — e.g. on
      // a dealer-scoped/interior search where Auto.dev can't help — is pointless.
      try {
        const r = await searchMarketCheck();
        results = r.results; total = r.total; provider = "marketcheck"; rateLimited = r.rateLimited;
        note = " (auto.dev failed, used marketcheck)";
      } catch (e2) {
        return NextResponse.json({ error: (e2 as Error).message }, { status: 502 });
      }
    } else {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  // Post-filter by selected range/config variant (e.g. "Extended Range"),
  // which lives in the version field — MarketCheck's trim param can't target it.
  const variant = String(body.variant || "").trim().toLowerCase();
  if (variant) {
    const words = variant.split(/\s+/).filter(Boolean);
    results = results.filter((r) => {
      const v = (r.version || "").toLowerCase();
      return words.every((w) => v.includes(w));
    });
  }

  // Payment-target filter — keep only vehicles whose estimated lease payment is
  // at or under the agent's target (e.g. "show me anything under $700/mo").
  const maxMonthly = Number(body.max_monthly) || 0;
  if (maxMonthly > 0) {
    // est_monthly is only populated for new cars with a real MSRP, so filtering
    // on it alone would drop EVERY used car (and any new car without MSRP). Fall
    // back to a price-based estimate for the cutoff so a "Used + under $X/mo"
    // search still returns its in-budget inventory.
    results = results.filter((r) => {
      const est = r.est_monthly > 0 ? r.est_monthly : estMonthlyCard(r.price, r.msrp || r.price);
      return est > 0 && est <= maxMonthly;
    });
  }

  // Package / option filter — the listing has no package data, so we decode each
  // result's VIN (NeoVIN, cached) and keep only those whose installed options
  // match every term. Expensive on first run (one decode per VIN), cheap after.
  const optionQuery = String(body.option_query || "").trim().toLowerCase();
  // Selected option pills (named build-sheet options, e.g. "ultraview sunroof").
  // Each must appear as a phrase in the decoded options; the free-text query
  // matches as individual words. Both run in one decode pass.
  const optionNames: string[] = Array.isArray(body.option_names)
    ? body.option_names.map((s: unknown) => String(s || "").trim().toLowerCase()).filter(Boolean)
    : [];
  let optionScanLimited = false;
  let decodeTimedOut = false; // loop broke on the wall-clock deadline (partial scan)
  if (optionQuery || optionNames.length) {
    const terms = optionQuery.split(/[,\s]+/).filter(Boolean);
    const all17 = results.filter((r) => r.vin && r.vin.length === 17);
    // Cap the number of VINs we decode per request — option filtering does one
    // decode per VIN, so an unbounded result set would time out and burn quota.
    const DECODE_CAP = 240;
    const withVin = all17.slice(0, DECODE_CAP);
    optionScanLimited = all17.length > DECODE_CAP;
    const kept: UnifiedVehicle[] = [];
    // Each decode is a live NeoVIN call (up to 12s) on a cold cache. Bound the
    // sequential chunk loop with a wall-clock deadline so a cold/slow run can't
    // blow maxDuration and 504 (mirrors the diagnose + cron decode loops) — keep
    // what we've scanned and flag the partial scan instead.
    const decodeDeadline = reqStart + 47_000; // 60s budget − ~13s for a last in-flight decode chunk
    let chunksRun = 0;
    for (let i = 0; i < withVin.length; i += 8) {
      if (Date.now() > decodeDeadline) { optionScanLimited = true; decodeTimedOut = true; break; }
      const chunk = withVin.slice(i, i + 8);
      const names = await Promise.all(chunk.map((r) => decodeVinOptionNames(r.vin)));
      chunksRun++;
      chunk.forEach((r, j) => {
        const hay = names[j].join(" | ");
        // Word-boundary match so "tow" can't match "Towel Hooks" etc.
        const okQuery = terms.every((t) => phraseMatch(hay, t));
        const okNames = optionNames.every((n) => phraseMatch(hay, n));
        if (okQuery && okNames) kept.push(r);
      });
    }
    // If the budget was exhausted before ANY chunk ran, don't collapse to the empty
    // `kept` set (that would wrongly show "no matches" for a healthy search) — keep
    // the un-filtered results and flag that the option filter couldn't be applied.
    if (chunksRun === 0 && withVin.length > 0) {
      note += " (couldn't apply the option filter in time — showing unfiltered matches)";
    } else {
      results = kept;
    }
  }

  if (decodeTimedOut) note += " (option filter ran out of time — partial scan; re-run for full coverage)";
  else if (optionScanLimited) note += " (option filter scanned the first 240 closest matches)";
  const narrowed = !!variant || maxMonthly > 0 || !!optionQuery || optionNames.length > 0;
  // Include `truncated` and `note` IN the cached payload so a cache-hit re-run
  // shows the same "showing first N" banner / note as the fresh response (the
  // hit path just spreads the stored payload).
  // When narrowed, results.length is the full narrowed count, so comparing it to
  // the pre-narrow num_found would falsely flag truncation — only on un-narrowed.
  const truncated = !narrowed && (total || 0) > results.length;
  // MarketCheck's dealer_id OR-list is capped at 200, so an org with more selected
  // dealers only searches the first 200 — say so instead of silently under-reporting.
  if (provider === "marketcheck" && dealerSources.length > 200) {
    note += ` (searching 200 of ${dealerSources.length} selected dealers — narrow your dealer list for full coverage)`;
  }
  const payload = { results, total: narrowed ? results.length : (total || results.length), provider, truncated, note: note || undefined };
  // Never persist a rate-limited/partial response — it would pin an empty result.
  // Cache empty results only briefly (nothing-in-stock can flip fast), AND cache a
  // deadline-truncated option scan only briefly too — otherwise an incomplete
  // option-filtered set (only the chunks that beat the clock) would be served as
  // authoritative for a full hour, hiding real matches.
  if (!rateLimited) {
    const shortTtl = results.length === 0 || decodeTimedOut || optionScanLimited;
    cacheSet(ckey, payload, shortTtl ? 2 * 60_000 : HOUR);
  }

  // Surface rateLimited so the client can skip the auto-diagnose retry (which
  // would fire a second MarketCheck call on an empty-because-rate-limited result).
  return NextResponse.json({ ...payload, rateLimited: rateLimited || undefined, cached: false, query: summarize(body) });
}

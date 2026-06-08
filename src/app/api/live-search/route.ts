// POST /api/live-search — live inventory search.
// Tries Auto.dev first (free tier), falls back to MarketCheck on rate-limit
// or error. Returns up to 50 results (one page). Ported from Base44.

import { NextResponse } from "next/server";
import {
  MC_HOST, AUTO_DEV_HOST, DEFAULT_LAT, DEFAULT_LNG, RADIUS_MILES,
  MAX_RESULTS, PAGE_SIZE, num, mcListing, adListing, mcKey, autoDevKey,
  resolveModel, decodeVinOptionNames, phraseMatch, fetchWithTimeout, estMonthlyCard, type UnifiedVehicle,
} from "@/lib/marketcheck";
import { cacheGet, cacheSet, HOUR } from "@/lib/memoryCache";
import { requireActivePlan } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// This route can decode many VINs for option filtering; give it headroom.
export const maxDuration = 60;

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
    radius: Math.min(500, Number(body.radius) || 100),
    lat: Math.round(Number(body.latitude || DEFAULT_LAT) * 10) / 10,
    lng: Math.round(Number(body.longitude || DEFAULT_LNG) * 10) / 10,
  };
  return "search::" + JSON.stringify(norm);
}

export async function POST(req: Request) {
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
    for (let page = 0; page * PAGE_SIZE < MAX_RESULTS; page++) {
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
      if (Array.isArray(body.dealer_ids) && body.dealer_ids.length) url.searchParams.set("dealer_id", [...body.dealer_ids].map(String).sort().slice(0, 200).join(","));
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
    for (let page = 1; (page - 1) * PAGE_SIZE < MAX_RESULTS; page++) {
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
      // Only constrain by location when the user actually gave one (ZIP →
      // lat/lng, or explicit lat/lng). For a true nationwide search, omit the
      // center/radius — otherwise we'd silently limit results to ~radius miles of
      // the default (New Jersey) coordinates and call it "nationwide".
      const hasGeo = !!(body.zip || (body.latitude && body.longitude));
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
  // Prefer MarketCheck whenever we have a key: it geocodes ZIPs natively AND
  // (on the Basic tier) handles unbounded nationwide queries. Auto.dev is the
  // fallback, used only if MarketCheck is unavailable or rate-limited.
  const preferMarketCheck = !!marketKey;
  // Filters Auto.dev cannot honor (no API param + no client-side post-filter):
  // dealer scope and interior color. We must not serve/cache an unfiltered Auto.dev
  // result for these — it'd silently ignore the filter.
  const autoDevCantHonor = (Array.isArray(body.dealer_ids) && body.dealer_ids.length > 0) || !!body.interior_color;
  try {
    if (preferMarketCheck) {
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
    } else if (provider !== "marketcheck" && marketKey) {
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
    const decodeDeadline = Date.now() + 40_000;
    for (let i = 0; i < withVin.length; i += 8) {
      if (Date.now() > decodeDeadline) { optionScanLimited = true; break; }
      const chunk = withVin.slice(i, i + 8);
      const names = await Promise.all(chunk.map((r) => decodeVinOptionNames(r.vin)));
      chunk.forEach((r, j) => {
        const hay = names[j].join(" | ");
        // Word-boundary match so "tow" can't match "Towel Hooks" etc.
        const okQuery = terms.every((t) => phraseMatch(hay, t));
        const okNames = optionNames.every((n) => phraseMatch(hay, n));
        if (okQuery && okNames) kept.push(r);
      });
    }
    results = kept;
  }

  if (optionScanLimited) note += " (option filter scanned the first 240 closest matches)";
  const narrowed = !!variant || maxMonthly > 0 || !!optionQuery || optionNames.length > 0;
  // Include `truncated` and `note` IN the cached payload so a cache-hit re-run
  // shows the same "showing first N" banner / note as the fresh response (the
  // hit path just spreads the stored payload).
  // When narrowed, results.length is the full narrowed count, so comparing it to
  // the pre-narrow num_found would falsely flag truncation — only on un-narrowed.
  const truncated = !narrowed && (total || 0) > results.length;
  // MarketCheck's dealer_id OR-list is capped at 200, so an org with more selected
  // dealers only searches the first 200 — say so instead of silently under-reporting.
  if (provider === "marketcheck" && Array.isArray(body.dealer_ids) && body.dealer_ids.length > 200) {
    note += ` (searching 200 of ${body.dealer_ids.length} selected dealers — narrow your dealer list for full coverage)`;
  }
  const payload = { results, total: narrowed ? results.length : (total || results.length), provider, truncated, note: note || undefined };
  // Never persist a rate-limited/partial response — it would pin an empty result.
  // Cache empty result sets only briefly: a genuine "nothing in stock" can flip
  // to results as soon as a dealer lists one, and a near-miss transient empty
  // shouldn't be served as the answer for a full hour.
  if (!rateLimited) cacheSet(ckey, payload, results.length === 0 ? 2 * 60_000 : HOUR);

  // Surface rateLimited so the client can skip the auto-diagnose retry (which
  // would fire a second MarketCheck call on an empty-because-rate-limited result).
  return NextResponse.json({ ...payload, rateLimited: rateLimited || undefined, cached: false, query: summarize(body) });
}

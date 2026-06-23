// POST /api/live-search — live inventory search.
// MarketCheck is the sole inventory provider (the Auto.dev fallback was removed —
// BUG-0027). Returns up to SEARCH_LIMIT (150) results across paged calls. A
// rate-limit (429) returns empty + a rate-limited note; a hard error returns 502.

import { NextResponse } from "next/server";
import {
  MC_HOST, RADIUS_MILES,
  PAGE_SIZE, num, mcListing, mcKey,
  resolveModel, decodeVinOptionNames, phraseMatch, fetchWithTimeout, estMonthlyCard,
  mcBodyType, mcDrivetrain, mcFuel, ROOF_OPTIONS, type UnifiedVehicle,
} from "@/lib/marketcheck";
import { cacheGet, cacheSet, HOUR } from "@/lib/memoryCache";
import { requireActivePlan } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// This route can decode many VINs for option filtering; give it headroom.
export const maxDuration = 60;

// Results fetched per search. MarketCheck active-search pages are PAGE_SIZE (50)
// rows, so 150 = 3 pages — enough breadth for brokers without rendering thousands
// of cards or making 30 sequential upstream calls.
const SEARCH_LIMIT = 150;

function summarize(body: any) {
  const base = [
    body.year_min && `${body.year_min}+`, body.make, body.model, body.trim, body.body_type,
    body.fuel, body.roof, body.drivetrain, body.powertrain_type, body.exterior_color,
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
    fuel: (body.fuel || "").toString().toLowerCase(), roof: (body.roof || "").toString().toLowerCase(),
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
  const marketKey = mcKey();
  if (!marketKey) {
    return NextResponse.json({ error: "MarketCheck API key not configured" }, { status: 500 });
  }

  // Resolve to MarketCheck's model string so brands like RAM (catalog "1500"
  // → MC "Ram 1500 Pickup") actually return results instead of zero.
  const mcModel = body.model && marketKey ? await resolveModel(body.make, body.model) : body.model;

  // Customer location: search around their ZIP. Radius is capped at 100mi
  // (MarketCheck Free-tier limit). Falls back to a default center when blank.
  const zip = String(body.zip || "").trim();
  const radius = Math.min(500, Number(body.radius) || RADIUS_MILES);

  // Dealer scoping: the standard /search/car/active endpoint returns a COUNT but
  // NO listings for a dealer_id/source filter under our entitlement — which is why
  // dealer-scoped searches came back empty. The Dealership Inventory Syndication
  // endpoint (/dealerships/inventory) DOES return per-dealer listings and accepts a
  // comma-OR dealer_id list (verified: multi-dealer merges sources correctly). It's
  // separately metered ($1/call), so we route to it ONLY when the search is actually
  // dealer-scoped; the 1h result cache bounds repeat cost. Dealer IDs are used
  // directly (exact match) — no fragile website-domain resolution.
  const dealerScoped = Array.isArray(body.dealer_ids) && body.dealer_ids.length > 0;
  const dealerIds: string[] = dealerScoped
    ? [...new Set(body.dealer_ids.map((d: unknown) => String(d ?? "").trim()).filter(Boolean) as string[])].sort()
    : [];
  // Roof maps to two MarketCheck fields: Convertible→body_type (honored by BOTH
  // endpoints), Sunroof/Panoramic→high_value_features. The dealer Syndication
  // endpoint IGNORES high_value_features (verified live), so for a dealer-scoped
  // search we apply the sunroof/pano requirement via the option post-filter
  // (decode) instead — exactly how the feature chips already work everywhere.
  const roofOpt = ROOF_OPTIONS.find((r) => r.label.toLowerCase() === String(body.roof || "").trim().toLowerCase());
  const roofBodyType = roofOpt?.field === "body_type" ? roofOpt.value : "";
  const roofFeature = roofOpt?.field === "high_value_features" ? roofOpt.value : "";
  // Guard: a dealer-scoped search with NO usable dealer IDs must return nothing —
  // never silently fall back to an unscoped (all-inventory) search.
  if (dealerScoped && !dealerIds.length) {
    return NextResponse.json({ results: [], total: 0, provider: "marketcheck", truncated: false,
      note: " (no valid dealers selected)", cached: false, query: summarize(body) });
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
    // The Dealership Inventory Syndication endpoint accepts rows up to 1500 and is
    // metered per CALL, so fetch all SEARCH_LIMIT results in ONE request instead of
    // 3 paginated 50-row calls — same results at ⅓ the per-search cost. The standard
    // active-search endpoint still caps rows at 50, so page it as before.
    const rows = dealerScoped ? SEARCH_LIMIT : PAGE_SIZE;
    for (let page = 0; page * rows < SEARCH_LIMIT; page++) {
      // Stop paging if we're near the function's time budget — a slow upstream over
      // ~15 sequential pages could otherwise blow maxDuration and 504. Keep what we
      // collected so far (the truncated note still fires downstream).
      if (page > 0 && Date.now() > reqStart + 47_000) break;
      // Dealer-scoped → Dealership Inventory Syndication endpoint (returns per-dealer
      // listings, $1/call); otherwise the standard active-search endpoint.
      const url = new URL(`${MC_HOST}${dealerScoped ? "/dealerships/inventory" : "/search/car/active"}`);
      url.searchParams.set("api_key", marketKey);
      url.searchParams.set("car_type", body.car_type || "new");
      // ZIP → local (geocoded), explicit lat/lng → local, neither → nationwide.
      // The Basic MarketCheck tier allows unbounded nationwide queries; on those
      // we skip radius + distance sort (there's no center to measure from). Skip geo
      // entirely for a dealer-scoped search — the selected dealers already define the
      // location, and the syndication endpoint isn't geo-sorted.
      const hasGeo = !dealerScoped && (!!zip || !!body.latitude);
      if (!dealerScoped) {
        if (zip) {
          url.searchParams.set("zip", zip);
        } else if (body.latitude) {
          url.searchParams.set("latitude", String(body.latitude));
          url.searchParams.set("longitude", String(body.longitude));
        }
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
      // Fuel: friendly label → powertrain_type value(s) (Hybrid→HEV,MHEV; etc.).
      // Falls back to a raw powertrain_type if a caller still sends one.
      const pt = mcFuel(body.fuel) || (body.powertrain_type ? String(body.powertrain_type) : "");
      if (pt) url.searchParams.set("powertrain_type", pt);
      // Map UI labels → MarketCheck facet values ("Truck"→Pickup, "Van"→Cargo
      // Van/Minivan/Passenger Van, "AWD"→4WD); an unmapped label matches nothing.
      // Convertible roof augments body_type (works on both endpoints).
      let btVal = mcBodyType(body.body_type);
      if (roofBodyType) btVal = [btVal, roofBodyType].filter(Boolean).join(",");
      if (btVal) url.searchParams.set("body_type", btVal);
      const dt = mcDrivetrain(body.drivetrain);
      if (dt) url.searchParams.set("drivetrain", dt);
      // exterior_color matches the full color string and accepts a comma-OR
      // list (e.g. "Agate Black,Agate Black Metallic") from the color picker.
      if (body.exterior_color) url.searchParams.set("exterior_color", body.exterior_color);
      if (body.interior_color) url.searchParams.set("interior_color", body.interior_color);
      // Sunroof/Panoramic via high_value_features — only for the standard endpoint
      // (the dealer Syndication endpoint ignores it; it's post-filtered below instead).
      const feats = Array.isArray(body.features) ? [...body.features] : [];
      if (roofFeature && !dealerScoped) feats.push(roofFeature);
      if (feats.length) url.searchParams.set("high_value_features", feats.join(","));
      // Scope to the company's selected dealers via the syndication endpoint's
      // comma-OR dealer_id list (capped at 200). dealerIds is already de-duped and
      // sorted, so the searched first-200 subset matches the (sorted) cache key —
      // an org with >200 dealers always searches the SAME first 200, never a
      // different subset between cache writes.
      if (dealerScoped) url.searchParams.set("dealer_id", dealerIds.slice(0, 200).join(","));
      url.searchParams.set("rows", String(rows));
      url.searchParams.set("start", String(page * rows));
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
      if (list.length < rows) break;
    }
    return { results: out.map(mcListing), total, rateLimited: false };
  }

  let results: UnifiedVehicle[] = [];
  let total = 0;
  const provider = "marketcheck";
  let note = "";
  let rateLimited = false;
  // MarketCheck is the sole inventory provider. The Auto.dev fallback was removed:
  // our entitlement's dataset lacked the mainstream makes brokers search (e.g.
  // make=Toyota/Honda → 0 listings), so it returned empty for most real queries —
  // worse than surfacing a clear rate-limit/unavailable message. A 429 returns an
  // empty result (not a throw); we annotate it as rate-limited rather than letting
  // the UI read it as "no inventory" and send the agent chasing filters that are fine.
  try {
    const r = await searchMarketCheck();
    results = r.results; total = r.total; rateLimited = r.rateLimited;
    if (r.rateLimited) note = " (inventory service rate-limited — try again shortly)";
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
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
  // Dealer-scoped Sunroof/Panoramic: the Syndication endpoint ignored the
  // high_value_features param, so enforce the roof here via the decode post-filter
  // (the decoded names include high_value_features like "sun/moonroof").
  if (dealerScoped && roofFeature) optionNames.push(roofFeature.toLowerCase());
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
  if (provider === "marketcheck" && dealerIds.length > 200) {
    note += ` (searching 200 of ${dealerIds.length} selected dealers — narrow your dealer list for full coverage)`;
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

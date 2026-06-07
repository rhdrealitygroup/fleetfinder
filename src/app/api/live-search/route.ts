// POST /api/live-search — live inventory search.
// Tries Auto.dev first (free tier), falls back to MarketCheck on rate-limit
// or error. Returns up to 50 results (one page). Ported from Base44.

import { NextResponse } from "next/server";
import {
  MC_HOST, AUTO_DEV_HOST, DEFAULT_LAT, DEFAULT_LNG, RADIUS_MILES,
  MAX_RESULTS, PAGE_SIZE, num, mcListing, adListing, mcKey, autoDevKey,
  resolveModel, decodeVinOptionNames, phraseMatch, type UnifiedVehicle,
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
    drivetrain: body.drivetrain || "", exterior_color: body.exterior_color || "",
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
      if (body.year_min || body.year_max) url.searchParams.set("year_range", `${body.year_min || 2020}-${body.year_max || 2027}`);
      if (body.price_min || body.price_max) url.searchParams.set("price_range", `${body.price_min || 0}-${body.price_max || 999999}`);
      if (body.miles_max) url.searchParams.set("miles_range", `0-${body.miles_max}`);
      if (body.powertrain_type) url.searchParams.set("powertrain_type", body.powertrain_type);
      if (body.body_type) url.searchParams.set("body_type", body.body_type);
      if (body.drivetrain) url.searchParams.set("drivetrain", body.drivetrain);
      // exterior_color matches the full color string and accepts a comma-OR
      // list (e.g. "Agate Black,Agate Black Metallic") from the color picker.
      if (body.exterior_color) url.searchParams.set("exterior_color", body.exterior_color);
      if (Array.isArray(body.features) && body.features.length) url.searchParams.set("high_value_features", body.features.join(","));
      // Scope to the company's selected dealers (MarketCheck OR-list of IDs).
      if (Array.isArray(body.dealer_ids) && body.dealer_ids.length) url.searchParams.set("dealer_id", body.dealer_ids.slice(0, 200).join(","));
      url.searchParams.set("rows", String(PAGE_SIZE));
      url.searchParams.set("start", String(page * PAGE_SIZE));
      const res = await fetch(url.toString());
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
      if (body.year_min || body.year_max) url.searchParams.set("vehicle.year", `${body.year_min || 2020}-${body.year_max || 2027}`);
      if (body.price_min || body.price_max) url.searchParams.set("retailListing.price", `${body.price_min || 0}-${body.price_max || 999999}`);
      if (body.miles_max) url.searchParams.set("retailListing.miles", `0-${body.miles_max}`);
      if (body.body_type) url.searchParams.set("vehicle.bodyStyle", body.body_type);
      if (body.drivetrain) url.searchParams.set("vehicle.drivetrain", body.drivetrain);
      if (body.exterior_color) url.searchParams.set("vehicle.exteriorColor", body.exterior_color);
      const lat = body.latitude || DEFAULT_LAT;
      const lng = body.longitude || DEFAULT_LNG;
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("radius", String(RADIUS_MILES));
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${autoKey}` } });
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
  try {
    if (preferMarketCheck) {
      const r = await searchMarketCheck();
      results = r.results; total = r.total; provider = "marketcheck"; rateLimited = r.rateLimited;
    } else if (autoKey) {
      const r = await searchAutoDev();
      results = r.results; total = r.total; provider = "auto.dev";
      if (r.rateLimited && marketKey) {
        note = " (auto.dev quota reached, used marketcheck)";
        const r2 = await searchMarketCheck();
        results = r2.results; total = r2.total; provider = "marketcheck";
      }
    } else if (marketKey) {
      const r = await searchMarketCheck();
      results = r.results; total = r.total; provider = "marketcheck"; rateLimited = r.rateLimited;
    }
  } catch (e) {
    if (marketKey && provider !== "marketcheck") {
      try {
        const r = await searchMarketCheck();
        results = r.results; total = r.total; provider = "marketcheck";
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
    results = results.filter((r) => r.est_monthly > 0 && r.est_monthly <= maxMonthly);
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
    // Decode in small chunks to avoid hammering MarketCheck.
    for (let i = 0; i < withVin.length; i += 8) {
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
  const payload = { results, total: narrowed ? results.length : (total || results.length), provider };
  // Never persist a rate-limited/partial response — it would pin an empty result.
  if (!rateLimited) cacheSet(ckey, payload, HOUR);

  return NextResponse.json({
    ...payload,
    cached: false,
    query: summarize(body),
    note: note || undefined,
    truncated: (total || 0) > results.length,
  });
}

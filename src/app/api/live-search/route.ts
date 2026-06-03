// POST /api/live-search — live inventory search.
// Tries Auto.dev first (free tier), falls back to MarketCheck on rate-limit
// or error. Returns up to 50 results (one page). Ported from Base44.

import { NextResponse } from "next/server";
import {
  MC_HOST, AUTO_DEV_HOST, DEFAULT_LAT, DEFAULT_LNG, RADIUS_MILES,
  MAX_RESULTS, PAGE_SIZE, num, mcListing, adListing, mcKey, autoDevKey,
  type UnifiedVehicle,
} from "@/lib/marketcheck";
import { cacheGet, cacheSet, HOUR } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

function summarize(body: any) {
  return [
    body.year_min && `${body.year_min}+`, body.make, body.model, body.trim, body.body_type,
    body.drivetrain, body.powertrain_type, body.exterior_color,
    body.price_max && `≤$${body.price_max}`, body.miles_max && `<${body.miles_max}mi`,
  ].filter(Boolean).join(" ") || "all new cars";
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
    lat: Math.round(Number(body.latitude || DEFAULT_LAT) * 10) / 10,
    lng: Math.round(Number(body.longitude || DEFAULT_LNG) * 10) / 10,
  };
  return "search::" + JSON.stringify(norm);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const autoKey = autoDevKey();
  const marketKey = mcKey();
  if (!autoKey && !marketKey) {
    return NextResponse.json({ error: "No search API key configured" }, { status: 500 });
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
    for (let page = 0; page * PAGE_SIZE < MAX_RESULTS; page++) {
      const url = new URL(`${MC_HOST}/search/car/active`);
      url.searchParams.set("api_key", marketKey);
      url.searchParams.set("car_type", body.car_type || "new");
      const lat = body.latitude || DEFAULT_LAT;
      const lng = body.longitude || DEFAULT_LNG;
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("radius", String(RADIUS_MILES));
      url.searchParams.set("sort_by", "distance");
      url.searchParams.set("sort_order", "asc");
      if (body.vin) url.searchParams.set("vin", String(body.vin).toUpperCase().trim());
      if (body.make) url.searchParams.set("make", body.make);
      if (body.model) url.searchParams.set("model", body.model);
      if (body.trim) url.searchParams.set("trim", body.trim);
      if (body.year_min || body.year_max) url.searchParams.set("year_range", `${body.year_min || 2020}-${body.year_max || 2027}`);
      if (body.price_min || body.price_max) url.searchParams.set("price_range", `${body.price_min || 0}-${body.price_max || 999999}`);
      if (body.miles_max) url.searchParams.set("miles_range", `0-${body.miles_max}`);
      if (body.powertrain_type) url.searchParams.set("powertrain_type", body.powertrain_type);
      if (body.body_type) url.searchParams.set("body_type", body.body_type);
      if (body.drivetrain) url.searchParams.set("drivetrain", body.drivetrain);
      if (body.exterior_color) url.searchParams.set("base_ext_color", body.exterior_color);
      if (Array.isArray(body.features) && body.features.length) url.searchParams.set("high_value_features", body.features.join(","));
      url.searchParams.set("rows", String(PAGE_SIZE));
      url.searchParams.set("start", String(page * PAGE_SIZE));
      const res = await fetch(url.toString());
      if (res.status === 429) return { results: out.map(mcListing), total, rateLimited: true };
      if (!res.ok) {
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
  try {
    if (autoKey) {
      const r = await searchAutoDev();
      results = r.results; total = r.total; provider = "auto.dev";
      if (r.rateLimited && marketKey) {
        note = " (auto.dev quota reached, used marketcheck)";
        const r2 = await searchMarketCheck();
        results = r2.results; total = r2.total; provider = "marketcheck";
      }
    } else if (marketKey) {
      const r = await searchMarketCheck();
      results = r.results; total = r.total; provider = "marketcheck";
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

  const payload = { results, total: variant ? results.length : (total || results.length), provider };
  cacheSet(ckey, payload, HOUR);

  return NextResponse.json({
    ...payload,
    cached: false,
    query: summarize(body),
    note: note || undefined,
    truncated: (total || 0) > results.length,
  });
}

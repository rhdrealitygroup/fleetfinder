// GET /api/usedcar/search — PUBLIC consumer used-car search (no auth).
// Reads the dumped inventory first; falls back to a live MarketCheck used search
// when the dump has nothing yet. Rate-limited + result-capped to protect quota.
// Returns a consumer-safe shape (no internal fields).

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MC_HOST, mcKey, mcListing, resolveModel } from "@/lib/marketcheck";
import { cacheGet, cacheSet, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PER = 24;

// Crude per-instance IP rate limit (best-effort; deters casual scraping).
function rateLimited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const key = `rl:usedcar:${ip}:${Math.floor(Date.now() / 60000)}`;
  const n = (cacheGet<number>(key) || 0) + 1;
  cacheSet(key, n, MIN);
  return n > 40; // 40 req/min/IP
}

function publicShape(v: any) {
  return {
    vin: v.vin, year: v.year, make: v.make, model: v.model, trim: v.trim,
    price: v.price || 0, miles: v.mileage ?? v.miles ?? 0,
    color: v.exterior_color || "", image: v.image_url || (v.photo_gallery?.[0]) || "",
    dealer: v.dealer_name || "", city: v.city || "", state: v.state || "",
    url: v.listing_url || v.dealer_url || "", options: Array.isArray(v.options) ? v.options : [],
  };
}

export async function GET(req: Request) {
  if (rateLimited(req)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const make = (searchParams.get("make") || "").trim();
  const model = (searchParams.get("model") || "").trim();
  const priceMax = Number(searchParams.get("price_max")) || 0;
  const yearMin = Number(searchParams.get("year_min")) || 0;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);

  // ── 1) Try the dumped inventory ──
  try {
    const db = createServiceRoleClient();
    let q = db.from("inventory").select("payload,options", { count: "exact" }).eq("car_type", "used");
    if (make) q = q.ilike("make", make);
    if (model) q = q.ilike("model", model);
    if (priceMax) q = q.lte("price", priceMax);
    if (yearMin) q = q.gte("year", yearMin);
    q = q.order("price", { ascending: true }).range(page * PER, page * PER + PER - 1);
    const { data, count } = await q;
    if (data && data.length) {
      const results = data.map((r: any) => publicShape({ ...r.payload, options: r.options }));
      return NextResponse.json({ results, total: count || results.length, source: "inventory", page });
    }
  } catch { /* fall through to live */ }

  // ── 2) Fallback: live MarketCheck used search ──
  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ results: [], total: 0, source: "none" });
  try {
    const mcModel = make && model ? await resolveModel(make, model) : model;
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("car_type", "used");
    if (make) u.searchParams.set("make", make);
    if (mcModel) u.searchParams.set("model", mcModel);
    if (priceMax) u.searchParams.set("price_range", `0-${priceMax}`);
    if (yearMin) u.searchParams.set("year_range", `${yearMin}-2027`);
    u.searchParams.set("rows", String(PER));
    u.searchParams.set("start", String(page * PER));
    const r = await fetch(u.toString());
    if (!r.ok) return NextResponse.json({ results: [], total: 0, source: "live-error" });
    const d = await r.json();
    const results = (d.listings || []).map((l: any) => publicShape(mcListing(l)));
    return NextResponse.json({ results, total: Math.min(Number(d.num_found) || results.length, 1500), source: "live", page });
  } catch (e) {
    return NextResponse.json({ results: [], total: 0, error: (e as Error).message }, { status: 502 });
  }
}

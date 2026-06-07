// POST /api/list-styles — full factory style/trim catalog with rich metadata
// (MSRP, body, drivetrain, engine, mpg) for a (year, make, model). Ported from
// Base44. Used by the detail panel and as catalog data behind the trim picker.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, num, titleCase, fetchWithTimeout } from "@/lib/marketcheck";

export const maxDuration = 30;
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, styles: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const year = num(body.year);
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!year || !make || !model) {
    return NextResponse.json({ styles: [], error: "year, make, model required" }, { status: 400 });
  }

  const cacheKey = `styles::${year}::${make}::${model}`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ styles: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ styles: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const url = new URL(`${MC_HOST}/vehicle/style/${year}/${encodeURIComponent(make)}/${encodeURIComponent(model)}`);
    url.searchParams.set("api_key", apiKey);
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ styles: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const raw: any[] = Array.isArray(data) ? data
      : Array.isArray(data.styles) ? data.styles
      : Array.isArray(data.results) ? data.results : [];

    const styles = raw.map((s: any) => ({
      trim: titleCase(s.trim || s.name || s.style),
      style_id: s.style_id || s.id || "",
      base_msrp: num(s.base_msrp || s.msrp),
      body_type: titleCase(s.body_type || s.bodyStyle),
      doors: num(s.doors),
      drivetrain: s.drivetrain || s.driveTrain || "",
      transmission: titleCase(s.transmission),
      fuel_type: titleCase(s.fuel_type || s.fuelType),
      engine: titleCase(s.engine || s.engine_description),
      seating: num(s.std_seating || s.seating),
      city_mpg: num(s.city_mpg || s.cityMpg),
      highway_mpg: num(s.highway_mpg || s.highwayMpg),
    })).filter((s: any) => s.trim);

    cacheSet(cacheKey, styles, styles.length ? DAY : MIN);
    return NextResponse.json({ styles, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ styles: [], error: (e as Error).message }, { status: 502 });
  }
}

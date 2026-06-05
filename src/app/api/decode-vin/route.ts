// POST /api/decode-vin — VIN → factory build sheet via MarketCheck NeoVIN,
// with a basic-decode fallback. Splits installed equipment into packages vs
// options with humanized names. Ported from Base44.

import { NextResponse } from "next/server";
import { MC_HOST, mcKey, num, titleCase } from "@/lib/marketcheck";
import { cacheGet, cacheSet, DAY } from "@/lib/memoryCache";
import { getSessionContext } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

function normalizeNeoVin(vin: string, raw: any) {
  const build = raw.build || raw || {};
  // NeoVIN's real per-VIN factory options live in installed_options_details
  // (named, with MSRP). installed_equipment is a category dict, not the options
  // list — so prefer the details array.
  const installed: any[] = Array.isArray(raw.installed_options_details) ? raw.installed_options_details
    : Array.isArray(raw.installed_equipment) ? raw.installed_equipment
    : Array.isArray(build.installed_equipment) ? build.installed_equipment
    : Array.isArray(raw.options) ? raw.options : [];

  const packages: any[] = [];
  const options: any[] = [];
  for (const item of installed) {
    const name = item.name || item.description || item.option_name || "";
    if (!name) continue;
    const code = item.code || item.option_code || item.oem_code || "";
    const category = String(item.category || item.option_type || "").toLowerCase();
    const isPackage = /package|pkg|group|edition/i.test(name) || /package|pkg|group/i.test(category);
    const entry = {
      code,
      name: titleCase(name).replace(/\bPkg\b/g, "Package"),
      msrp: num(item.msrp || item.price || item.sale_price),
    };
    if (isPackage) packages.push(entry);
    else options.push(entry);
  }

  const interior = raw.interior_color || {};
  const interior_color = interior.name || interior.base || titleCase(build.interior_color) || "";

  return {
    vin,
    year: num(build.year), make: titleCase(build.make), model: titleCase(build.model),
    trim: titleCase(build.trim || build.style), msrp: num(raw.msrp || raw.combined_msrp || build.base_msrp || build.msrp),
    transmission: titleCase(build.transmission), drivetrain: build.drivetrain || "",
    engine: titleCase(build.engine), fuel_type: titleCase(build.fuel_type),
    body_type: titleCase(build.body_type), doors: num(build.doors),
    seating: num(build.seating_capacity || build.std_seating || build.seating),
    interior_color,
    electric_range: num(raw.electric_range),
    city_mpg: num(build.city_mpg || raw.city_mpg), highway_mpg: num(build.highway_mpg || raw.highway_mpg),
    packages, options, raw_count: installed.length,
  };
}

function normalizeBasicDecode(vin: string, raw: any) {
  const b = raw.build || raw || {};
  return {
    vin,
    year: num(b.year), make: titleCase(b.make), model: titleCase(b.model),
    trim: titleCase(b.trim), msrp: num(b.base_msrp || b.msrp),
    transmission: titleCase(b.transmission), drivetrain: b.drivetrain || "",
    engine: titleCase(b.engine), fuel_type: titleCase(b.fuel_type),
    body_type: titleCase(b.body_type), doors: num(b.doors), seating: num(b.std_seating),
    city_mpg: num(b.city_mpg), highway_mpg: num(b.highway_mpg),
    packages: [], options: [], raw_count: 0,
  };
}

export async function POST(req: Request) {
  const { user } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const vin = String(body.vin || "").toUpperCase().trim();
  if (vin.length !== 17) return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });

  const cacheKey = `vin::${vin}`;
  if (!body.fresh) {
    const hit = cacheGet<any>(cacheKey);
    if (hit) return NextResponse.json({ ...hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ vin, packages: [], options: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const url = new URL(`${MC_HOST}/decode/car/neovin/${vin}/specs`);
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url.toString());

    if (!res.ok) {
      if (res.status === 404) {
        const fb = new URL(`${MC_HOST}/decode/car/${vin}/specs`);
        fb.searchParams.set("api_key", apiKey);
        const fbRes = await fetch(fb.toString());
        if (fbRes.ok) {
          const decoded = normalizeBasicDecode(vin, await fbRes.json());
          cacheSet(cacheKey, decoded, DAY * 30);
          return NextResponse.json({ ...decoded, cached: false, provider: "marketcheck-basic" });
        }
      }
      const b = await res.text().catch(() => "");
      return NextResponse.json({ error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }

    const decoded = normalizeNeoVin(vin, await res.json());
    cacheSet(cacheKey, decoded, DAY * 30);
    return NextResponse.json({ ...decoded, cached: false, provider: "marketcheck-neovin" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

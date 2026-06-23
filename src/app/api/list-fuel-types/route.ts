// POST /api/list-fuel-types — the fuel options (Gas / Hybrid / Plug-in Hybrid /
// Electric) a specific make+model actually offers, from the live `powertrain_type`
// facet. Model-aware: only buckets the model has are returned. DB-first (nightly
// catalog), live-facet fallback — same shape as list-colors/list-trims.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, resolveModel, fetchWithTimeout, fuelLabelsFromFacet } from "@/lib/marketcheck";
import { readModelCatalog } from "@/lib/catalogRead";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

export const maxDuration = 60;
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, fuel_types: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make || !model) return NextResponse.json({ fuel_types: [] }); // need a model to be meaningful

  const carType = body.car_type || "new";
  const cacheKey = `fuel::${make}::${model}::${carType}`.toLowerCase();

  // DB-FIRST: the nightly snapshot stores the computed labels (new cars only).
  if (!body.fresh && carType === "new") {
    const cat = await readModelCatalog(make, model);
    if (cat?.fuelTypes && cat.fuelTypes.length) {
      return NextResponse.json({ fuel_types: cat.fuelTypes, cached: true, provider: "catalog" });
    }
  }
  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ fuel_types: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ fuel_types: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });
  try {
    const url = new URL(`${MC_HOST}/search/car/active`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", carType);
    url.searchParams.set("make", make);
    const mcModel = await resolveModel(make, model);
    if (mcModel) url.searchParams.set("model", mcModel);
    url.searchParams.set("rows", "0");
    url.searchParams.set("facets", "powertrain_type|0|10|1");
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ fuel_types: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const fuel_types = fuelLabelsFromFacet(data.facets?.powertrain_type);
    cacheSet(cacheKey, fuel_types, fuel_types.length ? DAY : MIN);
    return NextResponse.json({ fuel_types, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ fuel_types: [], error: (e as Error).message }, { status: 502 });
  }
}

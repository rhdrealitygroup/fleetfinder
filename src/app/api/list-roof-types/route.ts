// POST /api/list-roof-types — the roof options (Sunroof / Panoramic Roof /
// Convertible) a specific make+model actually offers. Sunroof/pano come from the
// `high_value_features` facet, Convertible from `body_type` — only those present
// for the model are returned. DB-first (nightly catalog), live-facet fallback.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, resolveModel, fetchWithTimeout, roofLabelsFromFacets } from "@/lib/marketcheck";
import { readModelCatalog } from "@/lib/catalogRead";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

export const maxDuration = 60;
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, roof_types: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make || !model) return NextResponse.json({ roof_types: [] });

  const carType = body.car_type || "new";
  const cacheKey = `roof::${make}::${model}::${carType}`.toLowerCase();

  if (!body.fresh && carType === "new") {
    const cat = await readModelCatalog(make, model);
    if (cat?.roofTypes && cat.roofTypes.length) {
      return NextResponse.json({ roof_types: cat.roofTypes, cached: true, provider: "catalog" });
    }
  }
  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ roof_types: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ roof_types: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });
  try {
    const url = new URL(`${MC_HOST}/search/car/active`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", carType);
    url.searchParams.set("make", make);
    const mcModel = await resolveModel(make, model);
    if (mcModel) url.searchParams.set("model", mcModel);
    url.searchParams.set("rows", "0");
    url.searchParams.set("facets", "body_type|0|20|1,high_value_features|0|80|1");
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ roof_types: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const roof_types = roofLabelsFromFacets(data.facets?.body_type, data.facets?.high_value_features);
    cacheSet(cacheKey, roof_types, roof_types.length ? DAY : MIN);
    return NextResponse.json({ roof_types, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ roof_types: [], error: (e as Error).message }, { status: 502 });
  }
}

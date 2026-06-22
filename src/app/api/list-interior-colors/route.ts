// POST /api/list-interior-colors — real interior colors for a make/model from
// the MarketCheck interior_color facet, deduped across dealer spelling variants.
// Mirrors list-colors (exterior). Plan-gated.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, resolveModel, fetchWithTimeout, cleanColorFacet } from "@/lib/marketcheck";
import { readModelCatalog, pickStoredColors } from "@/lib/catalogRead";

export const maxDuration = 60;
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, colors: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  const trim = String(body.trim || "").trim();
  if (!make) return NextResponse.json({ colors: [], error: "make required" }, { status: 400 });

  const carType = body.car_type || "new";
  const cacheKey = `intcolors::${make}::${model}::${carType}`.toLowerCase();

  // DB-FIRST: serve interior colors from the catalog snapshot (trim-specific
  // when a trim is selected); fall through to the live facet otherwise.
  if (!body.fresh && carType === "new") {
    const cat = await readModelCatalog(make, model);
    const stored = cat ? pickStoredColors(cat, "interior", trim) : null;
    if (stored && stored.length) {
      return NextResponse.json({ colors: stored, cached: true, provider: "catalog" });
    }
  }

  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ colors: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ colors: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const url = new URL(`${MC_HOST}/search/car/active`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", carType);
    const mcModel = model ? await resolveModel(make, model) : model;
    url.searchParams.set("make", make);
    if (mcModel) url.searchParams.set("model", mcModel);
    url.searchParams.set("rows", "0");
    url.searchParams.set("facets", "interior_color|0|100|1");
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ colors: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    // Clean + dedupe via the SAME helper the nightly snapshot uses (interior mode:
    // collapses trim-material qualifiers + " Interior" suffix), so the live
    // fallback list matches the DB-served list (BUG-0024). Comma-bearing compound
    // values (e.g. "Jet Black, Cloth Seat Trim") are dropped inside the helper —
    // they can't be represented in the comma-OR interior_color param. Raw values
    // are preserved in `variants` for exact MarketCheck filtering.
    const colors = cleanColorFacet(data.facets?.interior_color || [], "interior");

    cacheSet(cacheKey, colors, colors.length ? DAY : MIN);
    return NextResponse.json({ colors, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ colors: [], error: (e as Error).message }, { status: 502 });
  }
}

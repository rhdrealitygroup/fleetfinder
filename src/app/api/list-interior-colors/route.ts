// POST /api/list-interior-colors — real interior colors for a make/model from
// the MarketCheck interior_color facet, deduped across dealer spelling variants.
// Mirrors list-colors (exterior). Plan-gated.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, num, resolveModel } from "@/lib/marketcheck";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, colors: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make) return NextResponse.json({ colors: [], error: "make required" }, { status: 400 });

  const carType = body.car_type || "new";
  const cacheKey = `intcolors::${make}::${model}::${carType}`.toLowerCase();
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
    const res = await fetch(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ colors: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const facetItems: any[] = data.facets?.interior_color || [];

    const cleanName = (raw: string) => String(raw || "").replace(/\s+(interior|int\.?)$/i, "").trim();
    const dedupKey = (name: string) => String(name || "")
      .toLowerCase()
      .replace(/\s+(leather|leatherette|cloth|vinyl|premium|perforated)\s*$/i, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Bucket spelling variants under one display name, keep RAW facet values in
    // `variants` so search can filter MarketCheck exactly (comma-OR list).
    const buckets = new Map<string, { name: string; count: number; variants: string[] }>();
    for (const c of facetItems) {
      const raw = String(c.item || "").trim();
      const cleaned = cleanName(c.item);
      if (!cleaned) continue;
      const key = dedupKey(cleaned);
      if (!key) continue;
      const cnt = num(c.count);
      const prev = buckets.get(key);
      if (prev) {
        prev.count += cnt;
        if (cleaned.length > prev.name.length) prev.name = cleaned;
        if (raw && !prev.variants.includes(raw)) prev.variants.push(raw);
      } else {
        buckets.set(key, { name: cleaned, count: cnt, variants: raw ? [raw] : [] });
      }
    }
    const colors = [...buckets.values()].filter((c) => c.name.length > 0).sort((a, b) => a.name.localeCompare(b.name));

    cacheSet(cacheKey, colors, colors.length ? DAY : MIN);
    return NextResponse.json({ colors, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ colors: [], error: (e as Error).message }, { status: 502 });
  }
}

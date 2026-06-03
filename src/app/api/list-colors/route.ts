// POST /api/list-colors — real exterior colors for a make/model from the
// MarketCheck facet, deduped across dealer spelling variants. Ported from Base44.

import { NextResponse } from "next/server";
import { MC_HOST, mcKey, num, resolveModel } from "@/lib/marketcheck";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make) return NextResponse.json({ colors: [], error: "make required" }, { status: 400 });

  const cacheKey = `colors::${make}::${model}`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ colors: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ colors: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const url = new URL(`${MC_HOST}/search/car/active`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", body.car_type || "new");
    const mcModel = model ? await resolveModel(make, model) : model;
    url.searchParams.set("make", make);
    if (mcModel) url.searchParams.set("model", mcModel);
    url.searchParams.set("rows", "0");
    url.searchParams.set("facets", "exterior_color|0|100|1");
    const res = await fetch(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ colors: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const facetItems: any[] = data.facets?.exterior_color || [];

    const cleanName = (raw: string) => String(raw || "")
      .replace(/\s+Exterior Paint$/i, "")
      .replace(/\s+Clear-Coat\s+Exterior Paint$/i, " Clear-Coat")
      .trim();
    const dedupKey = (name: string) => String(name || "")
      .toLowerCase()
      .replace(/\s+(metallic|pearl|pearl-?coat|clear-?coat|tricoat|tri-?coat|mica)\s*$/i, "")
      .replace(/\s+(i{1,3}|iv|v|vi)\s*$/i, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const buckets = new Map<string, { name: string; count: number }>();
    for (const c of facetItems) {
      const cleaned = cleanName(c.item);
      if (!cleaned) continue;
      const key = dedupKey(cleaned);
      if (!key) continue;
      const cnt = num(c.count);
      const prev = buckets.get(key);
      if (prev) {
        prev.count += cnt;
        if (cleaned.length > prev.name.length) prev.name = cleaned;
      } else {
        buckets.set(key, { name: cleaned, count: cnt });
      }
    }
    const colors = [...buckets.values()]
      .filter((c) => c.name.length > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    cacheSet(cacheKey, colors, colors.length ? DAY : MIN);
    return NextResponse.json({ colors, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ colors: [], error: (e as Error).message }, { status: 502 });
  }
}

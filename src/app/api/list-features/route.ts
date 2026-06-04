// POST /api/list-features — real high-value options/features for a make/model,
// pulled from the MarketCheck high_value_features facet so the picker is
// specific to the selected vehicle (like trims and colors). Noise items
// (body-segment descriptors, transmission, generic upgrades) are filtered out.

import { NextResponse } from "next/server";
import { MC_HOST, mcKey, num, normalizeFeature, resolveModel } from "@/lib/marketcheck";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Items that aren't real "options" a shopper picks — body class, drivetrain
// basics, transmission, vague upgrades. Whole-word matched to avoid false hits.
const NOISE =
  /\b(full[- ]?size|mid[- ]?size|midsize|compact|subcompact|pickup|suv|sedan|coupe|hatchback|minivan|wagon|convertible|crossover|truck)\b|transmission|\bupgrade[d]?\s+(paint|wheel|tire|usb)/i;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make) return NextResponse.json({ features: [], error: "make required" }, { status: 400 });

  const cacheKey = `features::${make}::${model}::${body.car_type || "new"}`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<any[]>(cacheKey);
    if (hit) return NextResponse.json({ features: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ features: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const url = new URL(`${MC_HOST}/search/car/active`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", body.car_type || "new");
    url.searchParams.set("make", make);
    const mcModel = model ? await resolveModel(make, model) : model;
    if (mcModel) url.searchParams.set("model", mcModel);
    url.searchParams.set("rows", "0");
    url.searchParams.set("facets", "high_value_features|0|80|1");
    const res = await fetch(url.toString());
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      return NextResponse.json({ features: [], error: `MarketCheck ${res.status}: ${b.slice(0, 150)}` }, { status: 502 });
    }
    const data = await res.json();
    const facetItems: any[] = data.facets?.high_value_features || [];

    const features = facetItems
      .map((c) => ({ value: String(c.item || "").trim(), label: normalizeFeature(c.item), count: num(c.count) }))
      .filter((f) => f.value && f.label && !NOISE.test(f.value))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 30);

    cacheSet(cacheKey, features, features.length ? DAY : MIN);
    return NextResponse.json({ features, cached: false, provider: "marketcheck" });
  } catch (e) {
    return NextResponse.json({ features: [], error: (e as Error).message }, { status: 502 });
  }
}

// POST /api/list-features — real, named factory options for a make/model.
//
// Primary source: decode the build sheets of a sample of in-stock VINs and
// union their installed options (e.g. "UltraView Sunroof" / $1450). This gives
// OEM-specific, priced options that actually exist in real inventory — far
// richer than MarketCheck's generic high_value_features facet, which we keep
// only as a fallback for models with no decodeable build data.

import { NextResponse } from "next/server";
import {
  MC_HOST, mcKey, num, normalizeFeature, resolveModel, decodeVinOptionDetails,
} from "@/lib/marketcheck";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SAMPLE_VINS = 8; // build sheets to decode per model load (cached 30d each) — kept low to respect API quota

// Generic facet noise (body class, transmission, vague upgrades) — fallback only.
const NOISE =
  /\b(full[- ]?size|mid[- ]?size|midsize|compact|subcompact|pickup|suv|sedan|coupe|hatchback|minivan|wagon|convertible|crossover|truck)\b|transmission|\bupgrade[d]?\s+(paint|wheel|tire|usb)/i;

type Opt = { value: string; label: string; msrp: number; count: number };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make) return NextResponse.json({ features: [], error: "make required" }, { status: 400 });

  const carType = body.car_type || "new";
  const cacheKey = `features2::${make}::${model}::${carType}`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<Opt[]>(cacheKey);
    if (hit) return NextResponse.json({ features: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ features: [], error: "MARKETCHECK_API_KEY not set" }, { status: 500 });

  try {
    const mcModel = model ? await resolveModel(make, model) : model;

    // 1) Pull a sample of in-stock VINs for this make/model.
    const sUrl = new URL(`${MC_HOST}/search/car/active`);
    sUrl.searchParams.set("api_key", apiKey);
    sUrl.searchParams.set("car_type", carType);
    sUrl.searchParams.set("make", make);
    if (mcModel) sUrl.searchParams.set("model", mcModel);
    sUrl.searchParams.set("rows", String(SAMPLE_VINS));
    sUrl.searchParams.set("fields", "vin");
    const sRes = await fetch(sUrl.toString());
    const sData = sRes.ok ? await sRes.json() : { listings: [] };
    const vins: string[] = (sData.listings || [])
      .map((l: any) => String(l.vin || "").toUpperCase())
      .filter((v: string) => v.length === 17)
      .slice(0, SAMPLE_VINS);

    // 2) Decode build sheets (parallel, each cached 30d) and union options.
    const decoded = await Promise.all(vins.map(decodeVinOptionDetails));
    const map = new Map<string, Opt>();
    for (const opts of decoded) {
      for (const o of opts) {
        const key = o.name.toLowerCase();
        const cur = map.get(key);
        if (cur) {
          cur.count += 1;
          if (o.msrp > cur.msrp) cur.msrp = o.msrp;
        } else {
          map.set(key, { value: key, label: o.name, msrp: o.msrp, count: 1 });
        }
      }
    }
    let features = [...map.values()].sort(
      (a, b) => b.count - a.count || b.msrp - a.msrp || a.label.localeCompare(b.label),
    ).slice(0, 40);

    // 3) Supplement: when the build sheet is thin or empty (EVs like Tesla,
    //    low-option brands), top up the list with generic high_value_features
    //    so EVERY make/model gets a usable set of options.
    const hadBuildSheet = features.length > 0;
    if (features.length < 8) {
      const fUrl = new URL(`${MC_HOST}/search/car/active`);
      fUrl.searchParams.set("api_key", apiKey);
      fUrl.searchParams.set("car_type", carType);
      fUrl.searchParams.set("make", make);
      if (mcModel) fUrl.searchParams.set("model", mcModel);
      fUrl.searchParams.set("rows", "0");
      fUrl.searchParams.set("facets", "high_value_features|0|60|1");
      const fRes = await fetch(fUrl.toString());
      if (fRes.ok) {
        const fData = await fRes.json();
        const seen = new Set(features.map((f) => f.value));
        const facet: Opt[] = (fData.facets?.high_value_features || [])
          .map((c: any) => ({ value: String(c.item || "").trim().toLowerCase(), label: normalizeFeature(c.item), msrp: 0, count: num(c.count) }))
          .filter((f: Opt) => f.value && f.label && !NOISE.test(f.value) && !seen.has(f.value));
        features = [...features, ...facet].slice(0, 30);
      }
    }

    cacheSet(cacheKey, features, features.length ? DAY * 7 : MIN);
    return NextResponse.json({ features, cached: false, provider: hadBuildSheet ? "build-sheet" : "facet" });
  } catch (e) {
    return NextResponse.json({ features: [], error: (e as Error).message }, { status: 502 });
  }
}

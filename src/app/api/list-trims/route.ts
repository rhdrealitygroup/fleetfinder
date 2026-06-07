// POST /api/list-trims — accurate, complete trim list for a make/model.
//
// REBUILT from the Base44 version, which was unreliable because it used the
// listing facet as the source of truth (package-suffix noise, exact-match
// failures, nationwide availability that didn't match the radius-capped
// search, and a 30-day cache that could be poisoned by one empty response).
//
// New approach:
//   1. SOURCE OF TRUTH = MarketCheck Vehicle Style catalog across a year
//      window (currentYear+1 .. currentYear-3). Manufacturer-blessed, complete
//      regardless of inventory, year-pinned. Title-cased + deduped.
//   2. ENRICHMENT = listing facet (same make/model) provides availability +
//      live count, matched to catalog trims by a canonical key so package
//      suffixes don't fragment the list.
//   3. Trims present only in the facet (not catalog) are still included, so
//      nothing currently for sale is ever hidden.
//   4. Errors are surfaced; empty/failed results are cached only briefly.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import {
  MC_HOST, mcKey, num, titleCase, canonicalTrimKey, parseVariant, prettyTrim,
  isNoiseVariant, resolveModel, fetchWithTimeout,
} from "@/lib/marketcheck";

export const maxDuration = 30;
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Live data — never let Next cache upstream MarketCheck responses.
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

type Variant = { label: string; count: number };
type Trim = { name: string; count: number; available: boolean; msrp?: number; variants?: Variant[] };

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, trims: [] }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  const model = String(body.model || "").trim();
  if (!make) return NextResponse.json({ trims: [], error: "make required" }, { status: 400 });

  const carType = body.car_type || "new";
  const cacheKey = `trims::${make}::${model}::${carType}`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<Trim[]>(cacheKey);
    if (hit) return NextResponse.json({ trims: hit, cached: true, provider: "cache" });
  }

  const apiKey = mcKey();
  if (!apiKey) {
    return NextResponse.json(
      { trims: [], provider: "none", error: "MARKETCHECK_API_KEY not set" },
      { status: 500 },
    );
  }

  // Resolve to MarketCheck's actual model string (RAM "1500" → "Ram 1500 Pickup").
  const mcModel = model ? await resolveModel(make, model) : model;

  try {
    // ── 1. Catalog trims from Vehicle Style across a year window ───────────
    const currentYear = new Date().getFullYear();
    const years = model ? [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3] : [];
    const byKey = new Map<string, Trim>();

    const styleResults = await Promise.all(
      years.map(async (yr) => {
        try {
          const u = new URL(`${MC_HOST}/vehicle/style/${yr}/${encodeURIComponent(make)}/${encodeURIComponent(mcModel)}`);
          u.searchParams.set("api_key", apiKey);
          const r = await fetchWithTimeout(u.toString());
          if (!r.ok) return [];
          const d = await r.json();
          return Array.isArray(d) ? d : Array.isArray(d.styles) ? d.styles : Array.isArray(d.results) ? d.results : [];
        } catch {
          return [];
        }
      }),
    );

    for (const arr of styleResults) {
      for (const s of arr as any[]) {
        const name = prettyTrim(titleCase(s.trim || s.name || s.style));
        if (!name) continue;
        const key = canonicalTrimKey(name);
        if (!key) continue;
        const msrp = num(s.base_msrp || s.msrp);
        const existing = byKey.get(key);
        if (existing) {
          // Keep the cleanest (shortest non-empty) display name; richest MSRP.
          if (name.length < existing.name.length) existing.name = name;
          if (!existing.msrp && msrp) existing.msrp = msrp;
        } else {
          byKey.set(key, { name, count: 0, available: false, msrp: msrp || undefined });
        }
      }
    }

    // ── 2. Availability + live counts from the listing facet ───────────────
    const facetUrl = new URL(`${MC_HOST}/search/car/active`);
    facetUrl.searchParams.set("api_key", apiKey);
    facetUrl.searchParams.set("car_type", body.car_type || "new");
    facetUrl.searchParams.set("make", make);
    if (mcModel) facetUrl.searchParams.set("model", mcModel);
    facetUrl.searchParams.set("rows", "0");
    facetUrl.searchParams.set("facets", "trim|0|100|1");
    const facetRes = await fetchWithTimeout(facetUrl.toString(), { cache: "no-store" });
    if (facetRes.ok) {
      const fData = await facetRes.json();
      const facetItems: any[] = fData.facets?.trim || [];
      for (const t of facetItems) {
        const rawName = String(t.item || "");
        if (!rawName) continue;
        const key = canonicalTrimKey(rawName);
        const cnt = num(t.count);
        const existing = byKey.get(key);
        if (existing) {
          existing.available = true;
          existing.count += cnt;
        } else {
          // Trim exists in live inventory but not in the catalog window —
          // include it so nothing for sale is hidden. Use a clean display.
          byKey.set(key, { name: prettyTrim(titleCase(rawName)), count: cnt, available: true });
        }
      }
    }

    // ── 2b. Range/config sub-variants from the `version` facet ─────────────
    // MarketCheck's trim is top-level only (Denali). The granular config
    // (Extended Range, Max Range, …) lives in `version`. Facet on it, parse
    // out the meaningful sub-variant, and attach to the matching trim.
    const versionsByTrimKey = new Map<string, Map<string, number>>();
    try {
      const vUrl = new URL(`${MC_HOST}/search/car/active`);
      vUrl.searchParams.set("api_key", apiKey);
      vUrl.searchParams.set("car_type", body.car_type || "new");
      vUrl.searchParams.set("make", make);
      if (mcModel) vUrl.searchParams.set("model", mcModel);
      vUrl.searchParams.set("rows", "0");
      vUrl.searchParams.set("facets", "version|0|200|1");
      const vRes = await fetchWithTimeout(vUrl.toString());
      if (vRes.ok) {
        const vData = await vRes.json();
        const items: any[] = vData.facets?.version || [];
        for (const it of items) {
          const version = String(it.item || "");
          if (!version) continue;
          // Find which trim this version belongs to (longest trim-name prefix).
          let bestTrim: Trim | undefined;
          for (const t of byKey.values()) {
            if (version.toLowerCase().includes(t.name.toLowerCase())) {
              if (!bestTrim || t.name.length > bestTrim.name.length) bestTrim = t;
            }
          }
          if (!bestTrim) continue;
          const label = parseVariant(version, bestTrim.name);
          if (!label || isNoiseVariant(label)) continue;
          const tk = canonicalTrimKey(bestTrim.name);
          if (!versionsByTrimKey.has(tk)) versionsByTrimKey.set(tk, new Map());
          const m = versionsByTrimKey.get(tk)!;
          m.set(label, (m.get(label) || 0) + num(it.count));
        }
      }
    } catch { /* version facet is best-effort */ }

    // Attach variants (only when a trim has 2+ distinct ones — else pointless).
    for (const [tk, m] of versionsByTrimKey) {
      const trim = byKey.get(tk);
      if (!trim) continue;
      const variants = [...m.entries()].map(([label, count]) => ({ label, count }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (variants.length >= 2) trim.variants = variants;
    }

    // ── 3. Sort: available first (by count desc), then the rest A-Z ────────
    const all = [...byKey.values()];
    const available = all.filter((t) => t.available).sort((a, b) => a.name.localeCompare(b.name));
    const unavailable = all.filter((t) => !t.available).sort((a, b) => a.name.localeCompare(b.name));
    const trims = [...available, ...unavailable];

    // ── 4. Cache: real results 1 day, empty results only 1 min ────────────
    cacheSet(cacheKey, trims, trims.length ? DAY : MIN);

    return NextResponse.json({
      trims,
      cached: false,
      provider: "marketcheck",
      counts: { catalog: byKey.size, available: available.length },
    });
  } catch (e) {
    return NextResponse.json({ trims: [], error: (e as Error).message }, { status: 502 });
  }
}

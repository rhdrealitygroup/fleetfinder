// POST /api/list-trims — accurate, complete trim list for a make/model.
//
// Source of truth = MarketCheck's live listing facets. (The former Vehicle Style
// catalog endpoint, /vehicle/style/{year}/{make}/{model}, now 404s for every
// make/model, so it can no longer be used.)
//
// Approach:
//   1. UNIVERSE = trim facet with NO car_type filter → every trim that exists in
//      live inventory (new + used), so nothing real is hidden. Deduped by a
//      canonical key so package suffixes don't fragment the list.
//   2. AVAILABILITY = trim facet scoped to the requested car_type → marks which
//      trims are in stock now and their live counts.
//   3. VARIANTS = the `version` facet supplies range/config sub-variants
//      (Extended Range, Max Range, …) attached to the matching trim.
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
    const byKey = new Map<string, Trim>();

    // Scope to recent model years so the list is "current trims", not decade-old
    // engine-code trims from very old used listings (e.g. a 2008 BMW "4.8is").
    const endYear = new Date().getFullYear() + 1;
    const yearRange = `${endYear - 8}-${endYear}`; // ~current + previous generation

    // Fetch the trim facet from the live listing index. `scoped=true` restricts to
    // the requested car_type (new/used) for availability + live counts; `scoped=false`
    // pulls the COMPLETE universe (any car_type) so trims that exist but aren't in the
    // selected car_type right now are still listed (marked unavailable / dimmed).
    const fetchTrimFacet = async (scoped: boolean): Promise<any[]> => {
      const u = new URL(`${MC_HOST}/search/car/active`);
      u.searchParams.set("api_key", apiKey);
      if (scoped) u.searchParams.set("car_type", carType);
      u.searchParams.set("make", make);
      if (mcModel) u.searchParams.set("model", mcModel);
      u.searchParams.set("year_range", yearRange);
      u.searchParams.set("rows", "0");
      u.searchParams.set("facets", "trim|0|100|1");
      const r = await fetchWithTimeout(u.toString(), { cache: "no-store" });
      if (!r.ok) return [];
      const d = await r.json();
      return (d.facets?.trim || []) as any[];
    };

    // ── 1. Complete trim list from live facets ─────────────────────────────
    // (MarketCheck's former Vehicle Style catalog endpoint now 404s, so the live
    // listing facets are the source of truth. The unscoped facet gives the full
    // trim universe; the scoped one supplies availability + counts.)
    const [universeItems, scopedItems] = await Promise.all([
      fetchTrimFacet(false),
      fetchTrimFacet(true),
    ]);

    // Seed every real trim from the universe (available=false until proven in-stock).
    for (const t of universeItems) {
      const rawName = String(t.item || "");
      if (!rawName) continue;
      const key = canonicalTrimKey(rawName);
      if (!key) continue; // empty canonical key would collapse distinct trims together
      const pretty = prettyTrim(titleCase(rawName));
      const existing = byKey.get(key);
      if (existing) {
        if (pretty && pretty.length < existing.name.length) existing.name = pretty; // cleanest display name
      } else {
        byKey.set(key, { name: pretty, count: 0, available: false });
      }
    }

    // ── 2. Availability + live counts for the requested car_type ───────────
    for (const t of scopedItems) {
      const rawName = String(t.item || "");
      if (!rawName) continue;
      const key = canonicalTrimKey(rawName);
      if (!key) continue;
      const cnt = num(t.count);
      const existing = byKey.get(key);
      if (existing) {
        existing.available = true;
        existing.count += cnt;
      } else {
        byKey.set(key, { name: prettyTrim(titleCase(rawName)), count: cnt, available: true });
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

// POST /api/list-models — the make's model list for the picker.
//
// NEW mode: the static catalog is authoritative (curated, no API call needed),
// so this route just echoes CAR_CATALOG[make]. The frontend already has that
// list locally; the route exists so used mode and new mode share one shape.
//
// USED mode: the static new-car catalog is NOT enough — used inventory legitimately
// includes discontinued/older models (Fusion, CT6, Veloster, A-Class…) that no
// longer ship new. So we DERIVE the model list from MarketCheck's live used-listing
// `model` facet and UNION it with the static catalog:
//   • Every static catalog model is always shown (selectable even at 0 used count
//     right now — honest zero, never hidden). This is the soft-hide rule.
//   • Derived models that don't fold into a static one (by normalized-substring
//     match, longest wins) are appended as used-only discoveries with live counts.
// Result is cached (1 day; empty → 1 min) exactly like list-trims.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, num, titleCase, fetchWithTimeout } from "@/lib/marketcheck";
import { CAR_CATALOG } from "@/lib/carCatalog";
import { cacheGet, cacheSet, DAY, MIN } from "@/lib/memoryCache";

export const maxDuration = 30;
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ModelRow = { model: string; count: number; source: "catalog" | "used" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error, models: [] }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const make = String(body.make || "").trim();
  if (!make) return NextResponse.json({ models: [], error: "make required" }, { status: 400 });

  const carType = body.car_type === "used" ? "used" : "new";

  // Static catalog list for this make (case-insensitive key match).
  const makeKey = Object.keys(CAR_CATALOG).find((k) => k.toLowerCase() === make.toLowerCase());
  const staticModels = makeKey ? CAR_CATALOG[makeKey] : [];

  // NEW mode is fully static — no API call, no billing. Return the curated list.
  if (carType === "new") {
    const detail: ModelRow[] = staticModels.map((m) => ({ model: m, count: 0, source: "catalog" }));
    return NextResponse.json({ models: staticModels, detail, provider: "catalog", cached: false });
  }

  const cacheKey = `models::${make}::used`.toLowerCase();
  if (!body.fresh) {
    const hit = cacheGet<ModelRow[]>(cacheKey);
    if (hit) {
      return NextResponse.json({ models: hit.map((r) => r.model), detail: hit, cached: true, provider: "cache" });
    }
  }

  const apiKey = mcKey();
  if (!apiKey) {
    // No key → degrade to the static catalog rather than an empty picker.
    const detail: ModelRow[] = staticModels.map((m) => ({ model: m, count: 0, source: "catalog" }));
    return NextResponse.json({ models: staticModels, detail, provider: "none", error: "MARKETCHECK_API_KEY not set" });
  }

  try {
    // Used inventory: scan the live model facet, scoped to roughly the last 15
    // model years so the picker stays relevant (not 1990s engine-code junk) while
    // still surfacing recently-discontinued models brokers actually lease used.
    const endYear = new Date().getFullYear() + 1;
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("car_type", "used");
    u.searchParams.set("make", make);
    u.searchParams.set("year_range", `${endYear - 15}-${endYear}`);
    u.searchParams.set("rows", "0");
    u.searchParams.set("facets", "model|0|250|1");
    const r = await fetchWithTimeout(u.toString(), { cache: "no-store" }).catch(() => null);

    // Transient upstream failure → fall back to the static catalog, cache only
    // briefly so we retry soon (never poison the picker with an empty/short list).
    if (!r || !r.ok) {
      const detail: ModelRow[] = staticModels.map((m) => ({ model: m, count: 0, source: "catalog" }));
      cacheSet(cacheKey, detail, MIN);
      return NextResponse.json({ models: staticModels, detail, provider: "catalog-fallback" });
    }
    const d: any = await r.json().catch(() => null);
    const items: any[] = (d?.facets?.model || []).filter((it: any) => it && it.item);

    // Pre-normalize static models once; longest-normalized-first so a derived
    // model folds into the most specific static entry it matches.
    const staticNorm = staticModels
      .map((m) => ({ name: m, n: norm(m) }))
      .filter((x) => x.n)
      .sort((a, b) => b.n.length - a.n.length);

    const catalogCounts = new Map<string, number>(); // static model name → summed used count
    const derived: ModelRow[] = [];

    for (const it of items) {
      const raw = String(it.item).trim();
      if (!raw) continue;
      const cnt = num(it.count);
      const nItem = norm(raw);
      // Fold into the longest static model whose normalized form is a substring.
      const match = staticNorm.find((s) => nItem.includes(s.n));
      if (match) {
        catalogCounts.set(match.name, (catalogCounts.get(match.name) || 0) + cnt);
      } else {
        derived.push({ model: titleCase(raw), count: cnt, source: "used" });
      }
    }

    // Static models always present (soft-hide: selectable at honest zero).
    const catalogRows: ModelRow[] = staticModels.map((m) => ({
      model: m,
      count: catalogCounts.get(m) || 0,
      source: "catalog",
    }));

    // Dedupe derived (titleCase can collide), keep highest count.
    const derivedByKey = new Map<string, ModelRow>();
    for (const row of derived) {
      const k = norm(row.model);
      const cur = derivedByKey.get(k);
      if (cur) cur.count += row.count;
      else derivedByKey.set(k, row);
    }
    const derivedRows = [...derivedByKey.values()].sort(
      (a, b) => b.count - a.count || a.model.localeCompare(b.model),
    );

    // Catalog A-Z first (curated, predictable), then used-only discoveries by count.
    const catalogSorted = [...catalogRows].sort((a, b) => a.model.localeCompare(b.model));
    const all = [...catalogSorted, ...derivedRows];

    cacheSet(cacheKey, all, all.length ? DAY : MIN);
    return NextResponse.json({
      models: all.map((r) => r.model),
      detail: all,
      cached: false,
      provider: "marketcheck",
      counts: { catalog: catalogSorted.length, derived: derivedRows.length },
    });
  } catch (e) {
    // Hard error → static catalog so the picker still works.
    const detail: ModelRow[] = staticModels.map((m) => ({ model: m, count: 0, source: "catalog" }));
    return NextResponse.json({ models: staticModels, detail, provider: "catalog-error", error: (e as Error).message });
  }
}

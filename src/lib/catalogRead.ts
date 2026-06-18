import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { num, parseVariant, isNoiseVariant, canonicalTrimKey } from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Read one model's stored catalog (the nightly snapshot) so the pickers can
// serve trims/colors from the DB instead of a live MarketCheck call. make/model
// are the catalog (CAR_CATALOG) strings the picker uses — the same values
// refresh-catalog stores — so no resolveModel is needed here. Returns null on
// any error so callers transparently fall back to the live path.
export type ModelCatalog = {
  trims?: { name: string; count: number }[];
  versions?: { name: string; count: number }[];
  colors?: { name: string; count: number; variants?: string[] }[];
  interiorColors?: { name: string; count: number; variants?: string[] }[];
  colorsByTrim?: Record<string, { name: string; count: number; variants?: string[] }[]>;
  interiorColorsByTrim?: Record<string, { name: string; count: number; variants?: string[] }[]>;
};

export async function readModelCatalog(make: string, model: string): Promise<ModelCatalog | null> {
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db
      .from("vehicle_catalog")
      .select("kind,payload")
      .eq("make", make)
      .eq("model", model);
    if (error || !data || !data.length) return null;
    const of = (k: string): any => data.find((r: any) => r.kind === k)?.payload;
    return {
      trims: of("trims"),
      versions: of("versions"),
      colors: of("colors"),
      interiorColors: of("interior_colors"),
      colorsByTrim: of("colors_by_trim"),
      interiorColorsByTrim: of("interior_colors_by_trim"),
    };
  } catch {
    return null;
  }
}

// Rebuild the list-trims response shape from stored trims + versions: every
// stored trim is in-stock-for-new (the snapshot is car_type=new), and the
// version facet supplies the sub-variants (Extended Range, …) attached to the
// matching trim — mirrors the live list-trims route's logic so the DB path is a
// drop-in.
export function buildTrimsFromCatalog(
  trims: { name: string; count: number }[],
  versions: { name: string; count: number }[] = [],
): { name: string; count: number; available: boolean; variants?: { label: string; count: number }[] }[] {
  const out = (trims || [])
    .filter((t) => t && t.name)
    .map((t) => ({ name: t.name, count: num(t.count), available: true } as
      { name: string; count: number; available: boolean; variants?: { label: string; count: number }[] }));

  const byKey = new Map<string, Map<string, number>>();
  for (const v of versions || []) {
    const version = String(v?.name || "");
    if (!version) continue;
    let best: { name: string } | undefined;
    for (const t of out) {
      if (version.toLowerCase().includes(t.name.toLowerCase())) {
        if (!best || t.name.length > best.name.length) best = t;
      }
    }
    if (!best) continue;
    const label = parseVariant(version, best.name);
    if (!label || isNoiseVariant(label)) continue;
    const tk = canonicalTrimKey(best.name);
    if (!byKey.has(tk)) byKey.set(tk, new Map());
    const m = byKey.get(tk)!;
    m.set(label, (m.get(label) || 0) + num(v?.count));
  }
  for (const t of out) {
    const m = byKey.get(canonicalTrimKey(t.name));
    if (!m) continue;
    const variants = [...m.entries()].map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (variants.length >= 2) t.variants = variants;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Pick the stored color list for a (model, optional trim): prefer the
// trim-specific set when a trim is given and present, else the model-level set.
export function pickStoredColors(
  cat: ModelCatalog,
  which: "exterior" | "interior",
  trim?: string,
): { name: string; count: number; variants?: string[] }[] | null {
  const byTrim = which === "exterior" ? cat.colorsByTrim : cat.interiorColorsByTrim;
  const modelLevel = which === "exterior" ? cat.colors : cat.interiorColors;
  const t = (trim || "").trim();
  if (t && byTrim && Array.isArray(byTrim[t]) && byTrim[t].length) return byTrim[t];
  if (Array.isArray(modelLevel) && modelLevel.length) return modelLevel;
  return null;
}

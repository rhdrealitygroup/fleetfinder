import "server-only";
import {
  MC_HOST, mcKey, num, resolveModel, fetchWithTimeout,
  cleanColorFacet, prettyTrim, titleCase, canonicalTrimKey, fixVersionName,
} from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

// One discrepancy between the stored catalog and live MarketCheck.
export type Discrepancy = {
  make: string;
  model: string;
  trim: string | null;
  field: "trim" | "ext_color" | "int_color" | "version";
  issue: "typo" | "missing" | "orphan" | "zero_count";
  stored_value: string | null;
  live_value: string | null;
  live_count: number | null;
};

// Small Levenshtein for typo detection (no deps).
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

const norm = (s: unknown) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// Cap per-trim color queries so one model can't blow the chain's wall-clock
// budget (each trim = one extra MarketCheck call).
const MAX_TRIMS_CHECKED = 15;

type ColorRow = { name: string; count?: number };

function compareColors(
  out: Discrepancy[], make: string, model: string, trim: string,
  field: "ext_color" | "int_color", stored: ColorRow[], live: { name: string; count: number }[],
) {
  const liveByNorm = new Map(live.map((c) => [norm(c.name), c.count]));
  const storedNorms = new Set(stored.map((c) => norm(c.name)));
  for (const s of stored) {
    if (liveByNorm.has(norm(s.name))) continue;
    const near = live.find((l) => { const d = lev(norm(s.name), norm(l.name)); return d > 0 && d <= 2; });
    out.push({ make, model, trim, field, issue: near ? "typo" : "orphan",
      stored_value: s.name, live_value: near ? near.name : null, live_count: near ? near.count : 0 });
  }
  for (const l of live) {
    if (!storedNorms.has(norm(l.name))) {
      out.push({ make, model, trim, field, issue: "missing", stored_value: null, live_value: l.name, live_count: l.count });
    }
  }
}

// Verify one model against live MarketCheck. Reads the stored snapshot from
// `db` (service-role) and compares trims, versions, and per-trim exterior/
// interior colors. Returns null on a TRANSIENT upstream failure so the caller
// does not record a false discrepancy or advance the cursor.
export async function verifyModel(db: any, make: string, model: string, deadline = 0): Promise<Discrepancy[] | null> {
  const apiKey = mcKey();
  if (!apiKey) return null;
  const mcModel = model ? await resolveModel(make, model) : "";
  const end = new Date().getFullYear() + 1;
  const yr = `${end - 8}-${end}`;

  const base = (extra: Record<string, string | number>) => {
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("car_type", "new");
    u.searchParams.set("make", make);
    if (mcModel) u.searchParams.set("model", mcModel);
    u.searchParams.set("year_range", yr);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
    return u;
  };

  // Live trims + versions (model-level marginals).
  const fRes = await fetchWithTimeout(base({ rows: 0, facets: "trim|0|100|1,version|0|100|1" }).toString(), { cache: "no-store" }).catch(() => null);
  if (!fRes || !fRes.ok) return null;
  const fd: any = await fRes.json().catch(() => null);
  if (!fd) return null;
  const liveTrims = (fd.facets?.trim || []).map((t: any) => ({
    raw: String(t.item || ""), name: prettyTrim(titleCase(t.item)), key: canonicalTrimKey(t.item), count: num(t.count),
  })).filter((t: any) => t.key);
  const liveVersions = (fd.facets?.version || []).map((t: any) => ({ name: fixVersionName(t.item), count: num(t.count) }));

  // Stored snapshot for this model.
  const { data: rows } = await db.from("vehicle_catalog").select("kind,payload").eq("make", make).eq("model", model);
  const storedOf = (k: string): any => (rows || []).find((r: any) => r.kind === k)?.payload;
  const storedTrims: ColorRow[] = storedOf("trims") || [];
  const storedVersions: ColorRow[] = storedOf("versions") || [];
  const storedCBT: Record<string, ColorRow[]> = storedOf("colors_by_trim") || {};
  const storedICBT: Record<string, ColorRow[]> = storedOf("interior_colors_by_trim") || {};

  const out: Discrepancy[] = [];
  const liveTrimKeys = new Set(liveTrims.map((t: any) => t.key));
  const storedTrimByKey = new Map(storedTrims.map((t) => [canonicalTrimKey(t.name), t]));

  // Trims: stored-but-not-live → zero_count (or typo if a near match exists);
  // live-but-not-stored → missing.
  for (const st of storedTrims) {
    const key = canonicalTrimKey(st.name);
    if (liveTrimKeys.has(key)) continue;
    const near = liveTrims.find((lt: any) => { const d = lev(key, lt.key); return d > 0 && d <= 2; });
    out.push({ make, model, trim: st.name, field: "trim", issue: near ? "typo" : "zero_count",
      stored_value: st.name, live_value: near ? near.name : null, live_count: near ? near.count : 0 });
  }
  for (const lt of liveTrims) {
    if (!storedTrimByKey.has(lt.key)) {
      out.push({ make, model, trim: lt.name, field: "trim", issue: "missing", stored_value: null, live_value: lt.name, live_count: lt.count });
    }
  }

  // Versions (configurations).
  const liveVerNorms = new Map(liveVersions.map((v: any) => [norm(v.name), v.count]));
  const storedVerNorms = new Set(storedVersions.map((v) => norm(v.name)));
  for (const sv of storedVersions) {
    if (liveVerNorms.has(norm(sv.name))) continue;
    const near = liveVersions.find((lv: any) => { const d = lev(norm(sv.name), norm(lv.name)); return d > 0 && d <= 2; });
    out.push({ make, model, trim: null, field: "version", issue: near ? "typo" : "zero_count",
      stored_value: String(sv.name), live_value: near ? near.name : null, live_count: near ? near.count : 0 });
  }
  for (const lv of liveVersions) {
    if (!storedVerNorms.has(norm(lv.name))) {
      out.push({ make, model, trim: null, field: "version", issue: "missing", stored_value: null, live_value: lv.name, live_count: lv.count });
    }
  }

  // Per-trim colors: query the highest-volume trims for their real exterior /
  // interior colors and compare to the stored per-trim sets.
  const trimsToCheck = [...liveTrims].sort((a: any, b: any) => b.count - a.count).slice(0, MAX_TRIMS_CHECKED);
  for (const lt of trimsToCheck) {
    if (deadline && Date.now() > deadline) break;
    const cRes = await fetchWithTimeout(base({ rows: 0, trim: lt.raw, facets: "exterior_color|0|80|1,interior_color|0|50|1" }).toString(), { cache: "no-store" }).catch(() => null);
    if (!cRes || !cRes.ok) continue;
    const cd: any = await cRes.json().catch(() => null);
    if (!cd) continue;
    const liveExt = cleanColorFacet(cd.facets?.exterior_color || []);
    const liveInt = cleanColorFacet(cd.facets?.interior_color || []);
    compareColors(out, make, model, lt.name, "ext_color", storedCBT[lt.name] || [], liveExt);
    compareColors(out, make, model, lt.name, "int_color", storedICBT[lt.name] || [], liveInt);
  }

  return out;
}

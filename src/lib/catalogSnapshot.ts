import "server-only";
import { MC_HOST, mcKey, num, resolveModel, decodeVinOptionDetails } from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Snapshot one model's catalog (trims, sub-variants, colors, options) for the
// nightly dump. Self-contained (used by the cron) — cheap facets + a small VIN
// decode sample. Not the live UI path; this is the persistent moat snapshot.
export async function snapshotModel(make: string, model: string) {
  const apiKey = mcKey();
  if (!apiKey) return null;
  const mcModel = model ? await resolveModel(make, model) : "";

  const base = (extra: Record<string, string | number>) => {
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("car_type", "new");
    u.searchParams.set("make", make);
    if (mcModel) u.searchParams.set("model", mcModel);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
    return u;
  };

  // Trims + sub-variants + colors in a single faceted call. If this call fails
  // (429/5xx), return null so the cron does NOT persist an empty snapshot or
  // advance the staleness cursor — otherwise a rate-limited night would wipe a
  // model's catalog to empty and skip retrying it for a full rotation.
  const fRes = await fetch(base({ rows: 0, facets: "trim|0|40,version|0|60,exterior_color|0|60,interior_color|0|60" }).toString());
  if (!fRes.ok) return null;
  const fd: any = await fRes.json().catch(() => null);
  if (!fd) return null;
  const trims = (fd.facets?.trim || []).map((t: any) => ({ name: t.item, count: num(t.count) }));
  const versions = (fd.facets?.version || []).map((t: any) => ({ name: t.item, count: num(t.count) }));
  const colors = (fd.facets?.exterior_color || []).map((c: any) => ({ name: c.item, count: num(c.count) }));
  const interiorColors = (fd.facets?.interior_color || []).map((c: any) => ({ name: c.item, count: num(c.count) }));
  // No facet data at all → treat as a transient miss, don't overwrite good data.
  if (!trims.length && !versions.length && !colors.length) return null;

  // Options: union named build-sheet options from a small VIN sample.
  const vRes = await fetch(base({ rows: 6, fields: "vin" }).toString());
  const vd: any = vRes.ok ? await vRes.json() : { listings: [] };
  const vins: string[] = (vd.listings || []).map((l: any) => String(l.vin || "").toUpperCase()).filter((v: string) => v.length === 17).slice(0, 6);
  const map = new Map<string, { name: string; msrp: number; count: number }>();
  for (const v of vins) {
    for (const o of await decodeVinOptionDetails(v)) {
      const k = o.name.toLowerCase();
      const cur = map.get(k);
      if (cur) { cur.count += 1; if (o.msrp > cur.msrp) cur.msrp = o.msrp; }
      else map.set(k, { name: o.name, msrp: o.msrp, count: 1 });
    }
  }
  const options = [...map.values()].sort((a, b) => b.count - a.count || b.msrp - a.msrp);

  return { trims, versions, colors, interiorColors, options, found: num(fd.num_found) };
}

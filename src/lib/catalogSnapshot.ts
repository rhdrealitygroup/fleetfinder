import "server-only";
import { MC_HOST, mcKey, num, resolveModel, decodeVinOptionDetails, fetchWithTimeout } from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Snapshot one model's catalog (trims, sub-variants, colors, options) for the
// nightly dump. Self-contained (used by the cron) — cheap facets + a small VIN
// decode sample. Not the live UI path; this is the persistent moat snapshot.
export async function snapshotModel(make: string, model: string, deadline = 0) {
  const apiKey = mcKey();
  if (!apiKey) return null;
  // Out of the cron's shared budget before we even start → skip (retried next run)
  // rather than risk a mid-model hard-kill past maxDuration.
  if (deadline && Date.now() > deadline) return null;
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
  const fRes = await fetchWithTimeout(base({ rows: 0, facets: "trim|0|40,version|0|60,exterior_color|0|60,interior_color|0|60" }).toString()).catch(() => null);
  if (!fRes || !fRes.ok) return null;
  const fd: any = await fRes.json().catch(() => null);
  if (!fd) return null;
  const trims = (fd.facets?.trim || []).map((t: any) => ({ name: t.item, count: num(t.count) }));
  const versions = (fd.facets?.version || []).map((t: any) => ({ name: t.item, count: num(t.count) }));
  const colors = (fd.facets?.exterior_color || []).map((c: any) => ({ name: c.item, count: num(c.count) }));
  const interiorColors = (fd.facets?.interior_color || []).map((c: any) => ({ name: c.item, count: num(c.count) }));
  // No facet data at all → treat as a transient miss, don't overwrite good data.
  if (!trims.length && !versions.length && !colors.length) return null;

  // Out of budget after the facets call → return the facet data (the main value)
  // and skip the heavier VIN-decode sample rather than risk a hard-kill.
  if (deadline && Date.now() > deadline) {
    return { trims, versions, colors, interiorColors, options: [], found: num(fd.num_found) };
  }

  // Options: union named build-sheet options from a small VIN sample.
  const vRes = await fetchWithTimeout(base({ rows: 6, fields: "vin" }).toString()).catch(() => null);
  const vd: any = vRes && vRes.ok ? await vRes.json() : { listings: [] };
  const vins: string[] = (vd.listings || []).map((l: any) => String(l.vin || "").toUpperCase()).filter((v: string) => v.length === 17).slice(0, 6);
  const map = new Map<string, { name: string; msrp: number; count: number }>();
  for (const v of vins) {
    if (deadline && Date.now() > deadline) break; // stop decoding if we're out of budget
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

import "server-only";
import { MC_HOST, mcKey, num, resolveModel, decodeVinOptionDetails, fetchWithTimeout, cleanColorFacet, fixVersionName, prettyTrim, titleCase } from "@/lib/marketcheck";

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
  // Fix known raw-data typos on versions (e.g. "Stamdard" → "Standard").
  const versions = (fd.facets?.version || []).map((t: any) => ({ name: fixVersionName(t.item), count: num(t.count) }));
  // Scrub factory paint-code cruft + dedupe so the stored catalog matches the
  // cleaned names the live picker shows (raw values preserved in `variants`).
  const colors = cleanColorFacet(fd.facets?.exterior_color || []);
  const interiorColors = cleanColorFacet(fd.facets?.interior_color || []);
  // No facet data at all → treat as a transient miss, don't overwrite good data.
  if (!trims.length && !versions.length && !colors.length) return null;

  // Out of budget after the facets call → return the facet data (the main value)
  // and skip the heavier listing sample rather than risk a hard-kill.
  if (deadline && Date.now() > deadline) {
    return { trims, versions, colors, interiorColors, colorsByTrim: {}, interiorColorsByTrim: {}, options: [], found: num(fd.num_found) };
  }

  // Sample real listings to learn the TRIM → COLOR associations (so each trim
  // carries only the exterior/interior colors actually in inventory for it) and
  // to seed the option VIN decode — one set of calls serves both. Facet marginals
  // can't give the joint trim×color distribution, so we tally it from listings.
  const byTrim = new Map<string, { ext: Map<string, number>; int: Map<string, number> }>();
  const sampleVins: string[] = [];
  const PAGES = 3, ROWS = 100;
  for (let page = 0; page < PAGES; page++) {
    if (deadline && Date.now() > deadline) break;
    const lRes = await fetchWithTimeout(base({ rows: ROWS, start: page * ROWS, fields: "vin,build.trim,exterior_color,interior_color" }).toString()).catch(() => null);
    if (!lRes || !lRes.ok) break;
    const ld: any = await lRes.json().catch(() => null);
    const listings: any[] = ld?.listings || [];
    if (!listings.length) break;
    for (const l of listings) {
      const vin = String(l.vin || "").toUpperCase();
      if (vin.length === 17 && sampleVins.length < 6) sampleVins.push(vin);
      const trim = String(l.build?.trim || "").trim();
      if (!trim) continue;
      if (!byTrim.has(trim)) byTrim.set(trim, { ext: new Map(), int: new Map() });
      const slot = byTrim.get(trim)!;
      const ext = String(l.exterior_color || l.base_ext_color || "").trim();
      const int = String(l.interior_color || l.base_int_color || "").trim();
      if (ext) slot.ext.set(ext, (slot.ext.get(ext) || 0) + 1);
      if (int) slot.int.set(int, (slot.int.get(int) || 0) + 1);
    }
    if (listings.length < ROWS) break;
  }
  // Clean each trim's color tallies through the same code-scrub/dedup as the
  // model-level lists. Stored keyed by trim's display name (prettyTrim).
  const toFacet = (m: Map<string, number>) => cleanColorFacet([...m.entries()].map(([item, count]) => ({ item, count })));
  const colorsByTrim: Record<string, ReturnType<typeof cleanColorFacet>> = {};
  const interiorColorsByTrim: Record<string, ReturnType<typeof cleanColorFacet>> = {};
  for (const [trim, slot] of byTrim) {
    const key = prettyTrim(titleCase(trim));
    const ext = toFacet(slot.ext);
    const int = toFacet(slot.int);
    if (ext.length) colorsByTrim[key] = ext;
    if (int.length) interiorColorsByTrim[key] = int;
  }

  // Options: union named build-sheet options from the sampled VINs.
  const map = new Map<string, { name: string; msrp: number; count: number }>();
  for (const v of sampleVins) {
    if (deadline && Date.now() > deadline) break; // stop decoding if we're out of budget
    for (const o of await decodeVinOptionDetails(v)) {
      const k = o.name.toLowerCase();
      const cur = map.get(k);
      if (cur) { cur.count += 1; if (o.msrp > cur.msrp) cur.msrp = o.msrp; }
      else map.set(k, { name: o.name, msrp: o.msrp, count: 1 });
    }
  }
  const options = [...map.values()].sort((a, b) => b.count - a.count || b.msrp - a.msrp);

  return { trims, versions, colors, interiorColors, colorsByTrim, interiorColorsByTrim, options, found: num(fd.num_found) };
}

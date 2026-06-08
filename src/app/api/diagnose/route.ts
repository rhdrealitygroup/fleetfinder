// POST /api/diagnose — when a search returns nothing, explain WHY and find the
// closest in-stock car. Strategy: query the pool with the "hard" constraints
// only (make/model/year/price/geo/dealers) and pull facets to see what colors /
// trims / options actually exist; then decode the top candidates to find the
// car matching the MOST of the requested options. Cheap (facets) + a few decodes.

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { MC_HOST, mcKey, num, normalizeFeature, resolveModel, decodeVinOptionNames, mcListing, phraseMatch, phraseMatchEither, fetchWithTimeout } from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

// This route does the most work of any path (facets + a closest-match search +
// up to 10 sequential live VIN decodes), and it auto-fires whenever a search
// returns zero — so it MUST carry the same wall-clock budget as live-search or
// it 504s on its own triggering condition.
export const maxDuration = 60;

export async function POST(req: Request) {
  const reqStart = Date.now(); // anchor the decode budget to request start, not post-fetch
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const b = await req.json().catch(() => ({}));
  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ error: "MARKETCHECK_API_KEY not set" }, { status: 500 });
  const make = String(b.make || "").trim();
  const model = String(b.model || "").trim();
  if (!make) return NextResponse.json({ error: "make required" }, { status: 400 });

  const mcModel = model ? await resolveModel(make, model) : "";
  const optionNames: string[] = (Array.isArray(b.option_names) ? b.option_names : []).map((s: any) => String(s).toLowerCase()).filter(Boolean);
  const wantColors: string[] = String(b.exterior_color || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const wantInterior: string[] = String(b.interior_color || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const wantTrim = String(b.trim || "").trim();
  const wantVariant = String(b.variant || "").trim();
  const maxMonthly = Number(b.max_monthly) || 0;

  // ── Base pool: hard constraints only (no trim/color/options) ───────────────
  function withHard(url: URL) {
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("car_type", b.car_type || "new");
    url.searchParams.set("make", make);
    if (mcModel) url.searchParams.set("model", mcModel);
    // Apply body_type/drivetrain as HARD filters too (live-search does) — otherwise
    // a search that returned 0 purely because of body style or drivetrain would be
    // diagnosed against a pool that ignores them and wrongly report "specs are fine".
    if (b.body_type) url.searchParams.set("body_type", String(b.body_type));
    if (b.drivetrain) url.searchParams.set("drivetrain", String(b.drivetrain));
    if (b.miles_max) url.searchParams.set("miles_range", `0-${b.miles_max}`);
    if (b.powertrain_type) url.searchParams.set("powertrain_type", String(b.powertrain_type));
    if (b.year_min || b.year_max) url.searchParams.set("year_range", `${b.year_min || 1900}-${b.year_max || new Date().getFullYear() + 1}`);
    if (b.price_min || b.price_max) url.searchParams.set("price_range", `${b.price_min || 0}-${b.price_max || 999999}`);
    const zip = String(b.zip || "").trim();
    if (zip) { url.searchParams.set("zip", zip); url.searchParams.set("radius", String(Math.min(500, Number(b.radius) || 100))); }
    // Sort BEFORE slicing so the searched first-200 subset matches the (sorted)
    // cache key in live-search for orgs with >200 dealers.
    if (Array.isArray(b.dealer_ids) && b.dealer_ids.length) url.searchParams.set("dealer_id", [...b.dealer_ids].map(String).sort().slice(0, 200).join(","));
  }

  try {
    const fUrl = new URL(`${MC_HOST}/search/car/active`);
    withHard(fUrl);
    fUrl.searchParams.set("rows", "0");
    fUrl.searchParams.set("facets", "exterior_color|0|60,interior_color|0|60,trim|0|40,high_value_features|0|80");
    const fRes = await fetchWithTimeout(fUrl.toString());
    // Distinguish "the data source is unavailable" from "nothing is in stock" —
    // a 429/5xx must NOT be reported to the agent as "no matches" (it'd send
    // them chasing constraints that are actually fine).
    if (!fRes.ok) {
      const detail = await fRes.text().catch(() => "");
      const msg = fRes.status === 429
        ? "The inventory service is rate-limited right now — try again in a moment."
        : `The inventory service is temporarily unavailable (${fRes.status}).`;
      return NextResponse.json({ error: msg, unavailable: true, status: fRes.status, detail: detail.slice(0, 150) }, { status: 503 });
    }
    const fData = await fRes.json();
    const poolTotal = num(fData.num_found);
    const colorFacet: any[] = fData.facets?.exterior_color || [];
    const interiorFacet: any[] = fData.facets?.interior_color || [];
    const trimFacet: any[] = fData.facets?.trim || [];
    const featFacet: string[] = (fData.facets?.high_value_features || []).map((x: any) => String(x.item || "").toLowerCase());

    const reasons: string[] = [];
    const fixes: { label: string; action: string; value?: string }[] = [];

    if (poolTotal === 0) {
      reasons.push(`No in-stock ${make}${model ? ` ${model}` : ""} matches your year/price${b.zip ? "/area" : ""}.`);
      if (b.zip && (Number(b.radius) || 100) < 500) fixes.push({ label: "Widen to 500 mi", action: "radius", value: "500" });
      if (Array.isArray(b.dealer_ids) && b.dealer_ids.length) fixes.push({ label: "Search all dealers", action: "all_dealers" });
      return NextResponse.json({ poolTotal, reasons, fixes, options: [], closest: null });
    }

    // ── Color ──
    let colorOk = true;
    if (wantColors.length) {
      const have = colorFacet.map((c) => String(c.item || "").toLowerCase());
      colorOk = wantColors.some((w) => have.some((h) => phraseMatchEither(h, w)));
      if (!colorOk) {
        const top = colorFacet.slice(0, 4).map((c) => c.item).filter(Boolean);
        reasons.push(`That color isn't in stock. Available: ${top.join(", ")}.`);
      }
    }

    // ── Interior color ──
    if (wantInterior.length) {
      const have = interiorFacet.map((c) => String(c.item || "").toLowerCase());
      const ok = wantInterior.some((w) => have.some((h) => phraseMatchEither(h, w)));
      if (!ok) {
        const top = interiorFacet.slice(0, 4).map((c) => c.item).filter(Boolean);
        reasons.push(`That interior color isn't in stock. Available: ${top.join(", ") || "—"}.`);
        fixes.push({ label: "Any interior color", action: "drop_interior_color" });
      }
    }

    // ── Trim ──
    let trimOk = true;
    if (wantTrim) {
      const have = trimFacet.map((t) => String(t.item || "").toLowerCase());
      trimOk = have.some((h) => phraseMatch(h, wantTrim));
      if (!trimOk) reasons.push(`No ${wantTrim} in stock. Available trims: ${trimFacet.slice(0, 5).map((t) => t.item).join(", ")}.`);
    }

    // ── Options: which exist at all in the pool ──
    const optionStatus = optionNames.map((o) => ({
      name: normalizeFeature(o),
      value: o,
      available: featFacet.some((f) => phraseMatchEither(f, o)),
    }));
    const missing = optionStatus.filter((o) => !o.available);
    if (missing.length) reasons.push(`${optionStatus.length - missing.length} of ${optionStatus.length} options in stock; not found: ${missing.map((m) => m.name).join(", ")}.`);

    // ── Payment cap & variant: these narrow the results CLIENT-SIDE in
    // live-search, so a perfectly healthy pool can still return zero. Surface
    // them explicitly so the agent isn't sent chasing color/trim that are fine.
    if (maxMonthly > 0) {
      reasons.push(`${poolTotal} match your specs, but a $${maxMonthly}/mo cap may exclude them — raising or clearing it should help.`);
      fixes.push({ label: "Clear monthly cap", action: "drop_max_monthly" });
    }
    if (wantVariant) {
      reasons.push(`The "${wantVariant}" configuration may not be in stock even though the model is.`);
      fixes.push({ label: `Any configuration`, action: "drop_variant" });
    }

    // ── Closest match: query the "wants" minus options, decode top candidates ──
    let closest: any = null;
    if (optionNames.length) {
      const cUrl = new URL(`${MC_HOST}/search/car/active`);
      withHard(cUrl);
      if (wantTrim && trimOk) cUrl.searchParams.set("trim", wantTrim);
      if (wantColors.length && colorOk) cUrl.searchParams.set("exterior_color", String(b.exterior_color));
      cUrl.searchParams.set("rows", "12");
      cUrl.searchParams.set("sort_by", "price"); cUrl.searchParams.set("sort_order", "asc");
      const cRes = await fetchWithTimeout(cUrl.toString());
      const cData = cRes.ok ? await cRes.json() : { listings: [] };
      const cands: any[] = (cData.listings || []).filter((l: any) => l.vin);
      let best: any = null, bestScore = -1, bestMissing: string[] = [];
      // Each decode is a live NeoVIN call (up to 12s). Bound the sequential loop
      // with a wall-clock deadline so a slow/cold-cache run can't blow maxDuration
      // and 504 — return the best match found so far instead.
      const decodeDeadline = reqStart + 47_000; // 60s budget − ~13s for a last in-flight decode
      const uniqueCands = [...new Map(cands.map((l) => [l.vin, l])).values()].slice(0, 10);
      for (const l of uniqueCands) {
        if (Date.now() > decodeDeadline) break;
        const names = (await decodeVinOptionNames(l.vin)).join(" | ");
        const hasList = optionStatus.map((o) => ({ ...o, on: phraseMatch(names, o.value) }));
        const score = hasList.filter((o) => o.on).length;
        if (score > bestScore) { bestScore = score; best = l; bestMissing = hasList.filter((o) => !o.on).map((o) => o.name); }
        if (score === optionStatus.length) break;
      }
      if (best) closest = { vehicle: mcListing(best), matched: bestScore, total: optionStatus.length, missing: bestMissing };
    }

    // ── Fixes ──
    for (const m of missing) fixes.push({ label: `Drop ${m.name}`, action: "drop_option", value: m.value });
    if (closest && closest.missing.length && closest.missing.length <= 2) for (const mm of closest.missing) {
      if (!fixes.some((f) => f.action === "drop_option" && normalizeFeature(String(f.value)) === mm)) {
        const opt = optionStatus.find((o) => o.name === mm);
        if (opt) fixes.push({ label: `Drop ${mm}`, action: "drop_option", value: opt.value });
      }
    }
    if (Array.isArray(b.dealer_ids) && b.dealer_ids.length) fixes.push({ label: "Search all dealers", action: "all_dealers" });
    if (b.zip && (Number(b.radius) || 100) < 500) fixes.push({ label: "Widen to 500 mi", action: "radius", value: "500" });

    return NextResponse.json({ poolTotal, reasons, options: optionStatus, closest, fixes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

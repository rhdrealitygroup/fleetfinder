// GET /api/cron/verify-catalog — verification SWEEP that diffs the stored
// vehicle_catalog against live MarketCheck and writes a discrepancy report to
// public.catalog_discrepancies. Self-chains like refresh-catalog until every
// model has been checked for the cycle, then stops. Secret-gated (CRON_SECRET).
//
// Manual run (dashboard "Run" or):  GET /api/cron/verify-catalog?secret=...
// Each model's prior findings are cleared as that model is re-checked (per-model,
// inside the loop) — not wiped up front — so a stop-short run never empties
// unrelated models; when the chain finishes the table holds the cycle's findings.
// Read it with:
//   select issue, count(*) from catalog_discrepancies group by issue;

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAR_CATALOG } from "@/lib/carCatalog";
import { verifyModel } from "@/lib/catalogVerify";

export const maxDuration = 60;

const MODELS = Object.entries(CAR_CATALOG).flatMap(([make, models]) =>
  (models as string[]).map((model) => ({ make, model })),
);

const MAX_LINKS = 450; // per-trim queries make models heavier — give the chain room to finish all models

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();

  const cycle = url.searchParams.get("cycle") || new Date().toISOString();
  const cycleStart = +new Date(cycle);
  const link = Number(url.searchParams.get("link")) || 0;

  // NON-DESTRUCTIVE: this job only READS vehicle_catalog and writes findings to
  // catalog_discrepancies. It never deletes/empties the catalog. The report is
  // refreshed PER MODEL (below) — not wiped up front — so if a run stops short
  // it only updates the models it actually re-checked and leaves every other
  // model's prior findings intact (a partial run never empties the report).

  const { data: rows } = await db.from("catalog_verify_state").select("key,updated_at");
  const seen = new Map((rows || []).map((r: { key: string; updated_at: string }) => [r.key, r.updated_at]));
  const pending = MODELS
    .filter((m) => {
      const u = seen.get(`${m.make}::${m.model}`);
      return !u || +new Date(u) < cycleStart;
    })
    .sort((a, b) => +new Date(seen.get(`${a.make}::${a.model}`) || 0) - +new Date(seen.get(`${b.make}::${b.model}`) || 0));

  const startedAt = Date.now();
  const BUDGET_MS = 45_000;
  const now = new Date().toISOString();
  let attempted = 0;
  let checked = 0;
  let found = 0;

  for (const { make, model } of pending) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    attempted++;
    try {
      const discrepancies = await verifyModel(db, make, model, startedAt + BUDGET_MS);
      if (discrepancies === null) continue; // transient miss — retry next cycle, don't touch its report
      // Refresh ONLY this model's findings: clear its prior rows, then write the
      // current ones (clearing alone means the model is now clean). Other models
      // are untouched, so a stop-short run never empties their results.
      await db.from("catalog_discrepancies").delete().eq("make", make).eq("model", model);
      if (discrepancies.length) {
        await db.from("catalog_discrepancies").insert(
          discrepancies.map((d) => ({ ...d, checked_at: now })),
        );
        found += discrepancies.length;
      }
      checked++;
    } catch {
      /* skip this model; still mark attempted below so the cycle can finish */
    }
    await db.from("catalog_verify_state").upsert({ key: `${make}::${model}`, updated_at: now });
  }

  const unattempted = pending.length - attempted;
  let chained = false;
  if (unattempted > 0 && link < MAX_LINKS) {
    const next = new URL(req.url);
    next.searchParams.set("secret", secret);
    next.searchParams.set("cycle", cycle);
    next.searchParams.set("link", String(link + 1));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try { await fetch(next.toString(), { signal: ctrl.signal }); } catch { /* independent invocation */ }
    clearTimeout(t);
    chained = true;
  }

  return NextResponse.json({ ok: true, link, cycle, checked, attempted, unattempted, discrepancies_found: found, chained });
}

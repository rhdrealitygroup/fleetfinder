// GET /api/cron/refresh-catalog — FULL nightly snapshot of the vehicle catalog
// into public.vehicle_catalog. One daily Vercel Cron kicks off the run; the
// function then SELF-CHAINS (each invocation triggers the next) until every
// model in the catalog has been re-snapshotted for tonight's cycle — so the
// whole catalog is refreshed every night, not rolled over weeks.
//
// Secret-gated (CRON_SECRET). Manual full fill / re-trigger:
//   GET /api/cron/refresh-catalog?secret=...
// Internal chain params (don't set by hand): `cycle` (this night's run id) and
// `link` (chain depth, capped to prevent runaway).

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAR_CATALOG } from "@/lib/carCatalog";
import { snapshotModel } from "@/lib/catalogSnapshot";

// Known-good serverless window (matches every other route here). One invocation
// snapshots as many models as fit the budget below, then chains the next — so
// the plan's real ceiling can't kill a run before it hands off to its successor.
export const maxDuration = 60;

const MODELS = Object.entries(CAR_CATALOG).flatMap(([make, models]) =>
  (models as string[]).map((model) => ({ make, model })),
);

// Cap chain depth so a bug (e.g. models that never persist) can't loop forever.
// MODELS/2 links × a few models each comfortably covers the whole catalog.
const MAX_LINKS = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();

  // `cycle` marks tonight's full pass. The first (cron-triggered) call has none,
  // so it stamps the cycle start; chained links carry it forward. A model counts
  // as "done tonight" once its catalog_sync_state.updated_at >= cycleStart.
  const cycle = url.searchParams.get("cycle") || new Date().toISOString();
  const cycleStart = +new Date(cycle);
  const link = Number(url.searchParams.get("link")) || 0;

  const { data: rows } = await db.from("catalog_sync_state").select("key,updated_at");
  const seen = new Map((rows || []).map((r: { key: string; updated_at: string }) => [r.key, r.updated_at]));
  // Pending tonight = never-snapshotted OR not yet refreshed in this cycle.
  // Order never-seen first, then oldest, so a partial night still makes progress.
  const pending = MODELS
    .filter((m) => {
      const u = seen.get(`${m.make}::${m.model}`);
      return !u || +new Date(u) < cycleStart;
    })
    .sort((a, b) => +new Date(seen.get(`${a.make}::${a.model}`) || 0) - +new Date(seen.get(`${b.make}::${b.model}`) || 0));

  const startedAt = Date.now();
  const BUDGET_MS = 40_000; // start no new model past 40s, leaving ~20s for the in-flight model + chain trigger under the 60s ceiling
  const now = new Date().toISOString();
  const done: string[] = [];
  let attempted = 0;
  for (const { make, model } of pending) {
    if (Date.now() - startedAt > BUDGET_MS) break; // out of time → chain continues the cycle
    attempted++;
    try {
      const snap = await snapshotModel(make, model, startedAt + BUDGET_MS);
      if (!snap) continue;
      const k = (kind: string) => `${make}::${model}::${kind}`.toLowerCase();
      await db.from("vehicle_catalog").upsert([
        { key: k("trims"), make, model, kind: "trims", payload: snap.trims, updated_at: now },
        { key: k("versions"), make, model, kind: "versions", payload: snap.versions, updated_at: now },
        { key: k("colors"), make, model, kind: "colors", payload: snap.colors, updated_at: now },
        { key: k("interior_colors"), make, model, kind: "interior_colors", payload: snap.interiorColors, updated_at: now },
        { key: k("options"), make, model, kind: "options", payload: snap.options, updated_at: now },
      ], { onConflict: "key" });
      await db.from("catalog_sync_state").upsert({ key: `${make}::${model}`, updated_at: now });
      done.push(`${make} ${model}`);
    } catch {
      /* skip this model, continue */
    }
  }

  // Models still UN-ATTEMPTED this cycle (we broke out of the loop on budget).
  // Empty/scarce models that returned null were still attempted, so they don't
  // keep the chain alive — the cycle ends once every model has been tried.
  const unattempted = pending.length - attempted;
  const remaining = Math.max(0, pending.length - done.length);
  // Chain the next link only if attempted < pending (i.e. we ran out of budget
  // mid-cycle). Fire the trigger but stop WAITING on it after ~1.5s: the request
  // has reached Vercel and spawned an independent invocation by then, so we
  // return without nesting the whole chain or blocking on downstream completion.
  let chained = false;
  if (unattempted > 0 && link < MAX_LINKS) {
    const next = new URL(req.url);
    next.searchParams.set("secret", secret);
    next.searchParams.set("cycle", cycle);
    next.searchParams.set("link", String(link + 1));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try { await fetch(next.toString(), { signal: ctrl.signal }); } catch { /* aborted/independent */ }
    clearTimeout(t);
    chained = true;
  }

  return NextResponse.json({ ok: true, link, cycle, snapshotted: done.length, attempted, unattempted, remaining, chained, models: done });
}

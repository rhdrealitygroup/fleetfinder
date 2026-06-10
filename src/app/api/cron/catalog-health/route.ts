// GET /api/cron/catalog-health — drift watchdog for the make/model catalog.
// Each run checks the stalest slice of models against live MarketCheck and records
// the real trim/color counts (INCLUDING zeros) in public.catalog_health. A model
// that previously had trims and now returns none is a REGRESSION (a model rename
// or a data-feed break, like the Vehicle Style endpoint that died) → email alert.
// Stalest-first rotation covers the whole catalog ~weekly. Secret-gated (CRON_SECRET).
// Manual run / initial baseline: GET /api/cron/catalog-health?secret=...&batch=400

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAR_CATALOG } from "@/lib/carCatalog";
import { checkModelHealth } from "@/lib/catalogHealth";
import { sendAlertEmail } from "@/lib/email";

export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODELS = Object.entries(CAR_CATALOG).flatMap(([make, ms]) =>
  (ms as string[]).map((model) => ({ make, model })),
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();

  // Stalest-first: never-checked models, then oldest last_checked.
  const { data: rows } = await db.from("catalog_health").select("make,model,last_checked,had_data,alerted_at");
  const seen = new Map((rows || []).map((r: any) => [`${r.make}::${r.model}`, r]));
  const pending = MODELS.filter((m) => !seen.has(`${m.make}::${m.model}`));
  const ordered = pending.length
    ? pending
    : MODELS.slice().sort((a, b) =>
        +new Date(seen.get(`${a.make}::${a.model}`)?.last_checked || 0) -
        +new Date(seen.get(`${b.make}::${b.model}`)?.last_checked || 0));

  // Default: ~1/7th of the catalog per day → full sweep ~weekly. A wall-clock
  // budget is the real guard so we never run past maxDuration.
  const batchSize = Math.max(1, Number(url.searchParams.get("batch")) || Math.ceil(MODELS.length / 7));
  const batch = ordered.slice(0, batchSize);

  const start = Date.now();
  const BUDGET_MS = 50_000;
  const regressions: string[] = [];
  let checked = 0, okCount = 0, empty = 0, skipped = 0;

  for (const m of batch) {
    if (Date.now() - start > BUDGET_MS) break;
    const res = await checkModelHealth(m.make, m.model);
    if (!res) { skipped++; continue; } // transient upstream failure → retry next run
    checked++;

    const prev: any = seen.get(`${m.make}::${m.model}`);
    const hadData = !!prev?.had_data;
    const nowOk = res.trims > 0;
    const nowIso = new Date(Date.now()).toISOString();
    const status = nowOk ? "ok" : hadData ? "regressed" : "empty";

    const patch: any = {
      make: m.make, model: m.model,
      trims: res.trims, ext_colors: res.ext, int_colors: res.int,
      had_data: hadData || nowOk, status, last_checked: nowIso,
    };
    if (nowOk) patch.last_ok_at = nowIso;

    // Alert only on a NEW regression: had data before, now zero, and we haven't
    // already emailed about it in the last ~week (avoid repeat spam).
    if (status === "regressed") {
      const lastAlert = prev?.alerted_at ? +new Date(prev.alerted_at) : 0;
      if (Date.now() - lastAlert > 6 * 24 * 3600 * 1000) {
        regressions.push(`${m.make} ${m.model}`);
        patch.alerted_at = nowIso;
      }
    }

    if (nowOk) okCount++; else if (status === "empty") empty++;
    await db.from("catalog_health").upsert(patch, { onConflict: "make,model" });
  }

  let emailed = false;
  if (regressions.length) {
    emailed = await sendAlertEmail(
      `⚠️ LotCompass: ${regressions.length} model(s) lost their spec data`,
      `These models had trim/spec data before and now return nothing from MarketCheck.\n` +
      `That usually means a model rename in MarketCheck or a data-feed break.\n\n` +
      regressions.map((r) => `  • ${r}`).join("\n") +
      `\n\nChecked ${checked} models this run. Fix by adding/correcting an entry in ` +
      `MODEL_ALIASES (src/lib/marketcheck.ts), or check MarketCheck status.\n`,
    );
  }

  return NextResponse.json({ ok: true, checked, okCount, empty, skipped, regressions, emailed });
}

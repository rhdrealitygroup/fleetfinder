// GET /api/cron/refresh-catalog — nightly rolling snapshot of the vehicle
// catalog into public.vehicle_catalog. Each run snapshots the stalest batch of
// models (fits the function timeout); a daily Vercel Cron cycles the whole
// catalog over time. Secret-gated (CRON_SECRET). Trigger manually for the
// initial fill: GET /api/cron/refresh-catalog?secret=...&batch=30

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAR_CATALOG } from "@/lib/carCatalog";
import { snapshotModel } from "@/lib/catalogSnapshot";

export const maxDuration = 60;

const MODELS = Object.entries(CAR_CATALOG).flatMap(([make, models]) =>
  (models as string[]).map((model) => ({ make, model })),
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceRoleClient();

  // Stalest first: never-snapshotted, then oldest updated_at.
  const { data: rows } = await db.from("catalog_sync_state").select("key,updated_at");
  const seen = new Map((rows || []).map((r: { key: string; updated_at: string }) => [r.key, r.updated_at]));
  const pending = MODELS.filter((m) => !seen.has(`${m.make}::${m.model}`));
  const ordered = pending.length
    ? pending
    : MODELS.slice().sort((a, b) => +new Date(seen.get(`${a.make}::${a.model}`) || 0) - +new Date(seen.get(`${b.make}::${b.model}`) || 0));
  const batch = ordered.slice(0, Math.max(1, Number(url.searchParams.get("batch")) || 25));

  const now = new Date().toISOString();
  const done: string[] = [];
  for (const { make, model } of batch) {
    try {
      const snap = await snapshotModel(make, model);
      if (!snap) continue;
      const k = (kind: string) => `${make}::${model}::${kind}`.toLowerCase();
      await db.from("vehicle_catalog").upsert([
        { key: k("trims"), make, model, kind: "trims", payload: snap.trims, updated_at: now },
        { key: k("versions"), make, model, kind: "versions", payload: snap.versions, updated_at: now },
        { key: k("colors"), make, model, kind: "colors", payload: snap.colors, updated_at: now },
        { key: k("options"), make, model, kind: "options", payload: snap.options, updated_at: now },
      ], { onConflict: "key" });
      await db.from("catalog_sync_state").upsert({ key: `${make}::${model}`, updated_at: now });
      done.push(`${make} ${model}`);
    } catch {
      /* skip this model, continue the batch */
    }
  }
  return NextResponse.json({ ok: true, snapshotted: done.length, remaining: Math.max(0, MODELS.length - (seen.size + done.length)), models: done });
}

// GET /api/cron/dump-inventory — every 6h. Syncs the deduped tracked-dealer set,
// refreshes the stalest dealers' listings, and decodes a batch of new VINs'
// options. Rolling/batched to fit the function timeout; secret-gated.
// Manual fill: GET /api/cron/dump-inventory?secret=...&dealers=12&decode=80

import { NextResponse } from "next/server";
import { syncTrackedDealers, stalestDealers, dumpDealerListings, decodeUndecoded } from "@/lib/inventoryDump";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracked = await syncTrackedDealers();

  // Batches sized to finish within maxDuration (60s) of sequential MarketCheck
  // calls; the rolling cron covers the rest of the fleet across runs.
  const dealerBatch = Math.max(1, Number(url.searchParams.get("dealers")) || 6);
  const decodeBatch = Math.max(0, Number(url.searchParams.get("decode")) || 60);

  const due = await stalestDealers(dealerBatch);
  const refreshed: { dealer: string; n: number }[] = [];
  for (const d of due as Array<{ dealer_id: string; name?: string; city?: string; state?: string }>) {
    try {
      const n = await dumpDealerListings(d.dealer_id, { name: d.name, city: d.city, state: d.state });
      refreshed.push({ dealer: d.dealer_id, n });
    } catch { /* skip, retried next run */ }
  }

  const decoded = decodeBatch > 0 ? await decodeUndecoded(decodeBatch) : 0;

  return NextResponse.json({ ok: true, tracked, refreshed: refreshed.length, listings: refreshed, decoded });
}

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

  // Wall-clock budget so the run always finishes within maxDuration (60s). A
  // hard platform kill mid-dump would skip the lock-release finally and leave a
  // dealer locked for ~3 min; stopping early avoids that and keeps each run clean.
  // Start the clock BEFORE syncTrackedDealers (its paged reads + GC delete can
  // take seconds) so that time is counted against the budget, not the safety margin.
  const startedAt = Date.now();
  const BUDGET_MS = 45_000;

  const tracked = await syncTrackedDealers(startedAt + BUDGET_MS);

  // Batches sized to finish within maxDuration (60s) of sequential MarketCheck
  // calls; the rolling cron covers the rest of the fleet across runs.
  const dealerBatch = Math.max(1, Number(url.searchParams.get("dealers")) || 6);
  const decodeBatch = Math.max(0, Number(url.searchParams.get("decode")) || 60);

  const due = await stalestDealers(dealerBatch);
  const refreshed: { dealer: string; n: number }[] = [];
  let rateLimited = false;
  for (const d of due as Array<{ dealer_id: string; name?: string; city?: string; state?: string }>) {
    if (Date.now() - startedAt > BUDGET_MS) break; // out of time → rest rolls to next run
    try {
      // Pass the shared run deadline so a dealer started late can't page past 60s.
      const n = await dumpDealerListings(d.dealer_id, { name: d.name, city: d.city, state: d.state }, startedAt + BUDGET_MS);
      refreshed.push({ dealer: d.dealer_id, n });
    } catch (e) {
      // MarketCheck rate-limited us → stop the batch (don't hammer it with the
      // rest); the next scheduled run retries. Other errors: skip this dealer.
      if (e instanceof Error && e.message === "RATE_LIMITED") { rateLimited = true; break; }
      /* else skip, retried next run */
    }
  }

  // Only decode if there's budget left AND we weren't just rate-limited — firing
  // the decode burst right after a 429 would just hammer the same limit (and the
  // decode endpoint shares the MarketCheck quota). Let the next run handle it.
  const remaining = BUDGET_MS - (Date.now() - startedAt);
  const decoded = !rateLimited && decodeBatch > 0 && remaining > 8_000
    ? await decodeUndecoded(decodeBatch, startedAt + BUDGET_MS)
    : 0;

  return NextResponse.json({ ok: true, tracked, refreshed: refreshed.length, listings: refreshed, decoded });
}

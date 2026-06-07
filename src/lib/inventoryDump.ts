import "server-only";
import { MC_HOST, mcKey, mcListing, num, fetchWithTimeout } from "@/lib/marketcheck";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Core of the inventory-dump pipeline. A deduped set of "tracked" dealers (every
// dealer any org has selected) is dumped into public.inventory; each car's
// options are decoded once and cached. The 6h cron refreshes listings + decodes
// new VINs; adding a dealer dumps its listings immediately.

const MC_PAGE = 100;
const MC_MAX_START = 1400; // keep start + rows <= 1500 (tier cap)

const DB_PAGE = 1000; // PostgREST silently caps an un-ranged select at ~1000 rows

// Read EVERY row of a table by paging with .range(); returns null on any read
// error so callers can refuse to act on a partial set. Critical here: the GC
// below would treat any rows missing from a truncated read as "unselected" and
// delete their inventory — so a silent 1000-row cap once `dealers` grows past it
// would wipe still-selected dealers across the whole platform.
async function readAll(db: any, table: string, columns: string, orderCol: string): Promise<any[] | null> {
  const all: any[] = [];
  for (let from = 0; ; from += DB_PAGE) {
    // ORDER BY a UNIQUE column is mandatory: without a stable order, OFFSET pages
    // can skip or duplicate rows as the table mutates between paged reads — and a
    // skipped still-selected dealer would be GC'd as "stale", wiping its inventory.
    const { data, error } = await db.from(table).select(columns).order(orderCol, { ascending: true }).range(from, from + DB_PAGE - 1);
    if (error || data == null) return null;
    all.push(...data);
    if (data.length < DB_PAGE) break;
  }
  return all;
}

// ── Keep tracked_dealers in sync with the deduped union of org selections ────
export async function syncTrackedDealers() {
  const db = createServiceRoleClient();
  // Snapshot tracked_dealers FIRST (before reading the dealers union). Any dealer
  // added by the on-select path AFTER this snapshot won't appear here, so it can
  // never become a GC candidate this run — closing a race that could delete a
  // just-added dealer's freshly-dumped inventory.
  const trackedBefore = await readAll(db, "tracked_dealers", "dealer_id", "dealer_id");

  // Page through ALL dealer rows. A truncated read would make the GC treat
  // still-selected dealers as stale and wipe their inventory, so abort on error.
  const rows = await readAll(db, "dealers", "dealer_key,name,city,state,selected", "id");
  if (rows == null) return 0;
  const selected = rows.filter((d: any) => d.dealer_key && d.selected !== false);
  const seen = new Map<string, any>();
  for (const d of selected) if (!seen.has(d.dealer_key)) seen.set(d.dealer_key, d);

  const ids = [...seen.keys()];
  if (ids.length) {
    await db.from("tracked_dealers").upsert(
      [...seen.values()].map((d: any) => ({ dealer_id: d.dealer_key, name: d.name || null, city: d.city || null, state: d.state || null })),
      { onConflict: "dealer_id", ignoreDuplicates: true }, // don't reset last_dumped_at
    );
  }
  // Garbage-collect dealers no org selects anymore (and their inventory), using
  // the EARLIER snapshot. SKIP the GC entirely if that read failed/was partial
  // (deleting from an incomplete view could wipe still-selected dealers).
  if (trackedBefore == null) return ids.length;
  const stale = trackedBefore.map((t: any) => t.dealer_id).filter((id: string) => !seen.has(id));
  // Chunk the deletes: PostgREST serializes .in() values into the request URL,
  // so a large one-time deselection could overflow the URL length limit and fail
  // the whole delete (leaving orphan rows). ~500 ids/chunk stays well under it.
  for (let i = 0; i < stale.length; i += 500) {
    const chunk = stale.slice(i, i + 500);
    await db.from("inventory").delete().in("dealer_id", chunk);
    await db.from("tracked_dealers").delete().in("dealer_id", chunk);
  }
  return ids.length;
}

// ── Dump one dealer's full inventory (fast: listings only, no decode) ─────────
export async function dumpDealerListings(dealerId: string, meta?: { name?: string; city?: string; state?: string }, deadline = 0) {
  const apiKey = mcKey();
  if (!apiKey || !dealerId) return 0;
  const db = createServiceRoleClient();

  const runStart = new Date().toISOString();

  // Per-dealer lock: register the dealer, then claim it. If another dump is
  // already in progress (lock set within the last 3 min), skip — two concurrent
  // dumps of the same dealer could otherwise clobber updated_at and sweep
  // still-in-stock cars.
  await db.from("tracked_dealers").upsert(
    { dealer_id: dealerId, name: meta?.name || null, city: meta?.city || null, state: meta?.state || null },
    { onConflict: "dealer_id", ignoreDuplicates: true },
  );
  const lockCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const claim = await db.from("tracked_dealers")
    .update({ dump_started_at: runStart })
    .eq("dealer_id", dealerId)
    .or(`dump_started_at.is.null,dump_started_at.lt.${lockCutoff}`)
    .select("dealer_id");
  if (!claim.data || claim.data.length === 0) return 0; // another dump holds the lock

  try {
    // Stamp every in-stock VIN this run with `runStart`; sold cars keep their
    // older updated_at and get swept below (timestamp mark-and-sweep — no
    // NOT-IN VIN list, so no URL-length/malformed-VIN issues).
    const rows: any[] = [];
    let complete = true; // false if any page fetch failed → don't sweep (avoid wiping on a transient 429)
    let numFound = 0;
    // Page-loop deadline so a large dealer can't run past the function's time
    // budget (the on-select after() path has no external budget guard). When the
    // caller passes its own run deadline (the cron's shared budget), respect the
    // EARLIER of the two so one dealer can't blow the whole run's 60s. Stopping
    // early marks the pull incomplete → no sweep, and the finally still releases
    // the lock — preventing a dangling lock on a kill.
    const pageDeadline = deadline ? Math.min(deadline, Date.now() + 45_000) : Date.now() + 45_000;
    for (let start = 0; start <= MC_MAX_START; start += MC_PAGE) {
      if (Date.now() > pageDeadline) { complete = false; break; }
      const u = new URL(`${MC_HOST}/search/car/active`);
      u.searchParams.set("api_key", apiKey);
      u.searchParams.set("dealer_id", dealerId);
      u.searchParams.set("rows", String(MC_PAGE));
      u.searchParams.set("start", String(start));
      // A timeout throws (AbortError) — treat it exactly like a failed page:
      // mark the pull incomplete so the destructive sweep below is skipped.
      let r: Response;
      try { r = await fetchWithTimeout(u.toString()); }
      catch { complete = false; break; }
      if (!r.ok) { complete = false; break; }
      const d = await r.json();
      if (start === 0) numFound = num(d.num_found) || 0;
      const list: any[] = d.listings || [];
      for (const l of list) {
        const v = mcListing(l);
        if (!v.vin || v.vin.length !== 17) continue;
        const it = String(l.inventory_type || "").toLowerCase();
        const carType = it.includes("used") || it.includes("certified") || it.includes("cpo") ? "used"
          : it.includes("new") ? "new" : (v.mileage > 200 ? "used" : "new");
        rows.push({
          vin: v.vin, dealer_id: dealerId,
          make: v.make || null, model: v.model || null, trim: v.trim || null, year: v.year || null,
          price: v.price || null, msrp: v.msrp || null, miles: v.mileage || null,
          exterior_color: v.exterior_color || null,
          car_type: carType,
          payload: v, updated_at: runStart,
        });
      }
      if (list.length < MC_PAGE) break;
    }

    // Upsert listing fields only — omit options/options_decoded so already-decoded
    // VINs keep their cached options and new VINs default to undecoded.
    // Conflict on (dealer_id, vin): each dealer owns its own copy of a shared VIN
    // so one dealer's dump can't reassign/sweep another dealer's in-stock car.
    // Dedupe by (dealer_id, vin) first — MarketCheck's offset paging can return
    // the same VIN twice when inventory shifts mid-dump, and Postgres rejects an
    // ON CONFLICT statement that touches the same target row twice (error 21000).
    const deduped = [...new Map(rows.map((r) => [`${r.dealer_id}|${r.vin}`, r])).values()];
    if (deduped.length) await db.from("inventory").upsert(deduped, { onConflict: "dealer_id,vin" });

    // A dealer with more active listings than the tier's offset cap (1500) lets
    // us page through is TRUNCATED — we only stamped the first 1500 this run, so
    // the un-fetched tail must NOT be swept as "sold" or we'd delete in-stock
    // cars every run. We still refresh what we saw and advance last_dumped_at so
    // the dealer keeps rotating (it just never gets a destructive sweep).
    const FETCH_CAP = MC_MAX_START + MC_PAGE; // 1500
    const truncated = numFound > FETCH_CAP;

    // POSITIVE-CONFIRMATION before the destructive sweep. MarketCheck can return
    // a soft 200 (empty body, num_found 0, or far fewer listings than claimed) on
    // transient backend/dealer_id hiccups — indistinguishable from a real "all
    // sold". We only sweep when we actually retrieved listings AND collected ~all
    // of the claimed count (allowing for invalid-VIN skips). Otherwise we keep the
    // existing inventory and let the next clean dump reconcile it. (A dealer that
    // genuinely empties keeps stale rows until it relists — the safe trade-off vs.
    // wiping a still-stocked dealer on a transient blip.)
    const sweepSafe = !truncated && rows.length > 0 && numFound > 0 && rows.length >= numFound * 0.8;
    if (complete) {
      if (sweepSafe) {
        await db.from("inventory").delete().eq("dealer_id", dealerId).lt("updated_at", runStart);
      }
      // Advance the freshness clock on EVERY complete pull — including a clean
      // empty one. A genuinely empty/closed-out dealer left at last_dumped_at=null
      // would sort first forever (stalestDealers nullsFirst) and, once ≥ the per-run
      // batch of them exist, monopolize every cron run so the rest of the fleet never
      // refreshes. The sweepSafe guard above still prevents a transient soft-empty
      // from wiping inventory; here we just stop re-selecting it every single run.
      await db.from("tracked_dealers")
        .update({ last_dumped_at: runStart, listing_count: truncated ? numFound : rows.length })
        .eq("dealer_id", dealerId);
    }
    return rows.length;
  } finally {
    // Release the lock ONLY if we still hold it — if this dump ran past the lock
    // cutoff and another dump claimed the dealer, don't clear the new holder's
    // lock (that's what re-opened the concurrent-sweep race).
    await db.from("tracked_dealers").update({ dump_started_at: null })
      .eq("dealer_id", dealerId).eq("dump_started_at", runStart);
  }
}

// ── Decode options for VINs not yet decoded (the heavy step; batched) ─────────
// deadline (epoch ms, 0 = none): stop before the function's time budget so the
// platform doesn't kill the run mid-decode. Each decode is a real HTTP call up
// to the fetch timeout, so the caller's "ms / 600" sizing was unrealistic — the
// deadline is the real guard.
const MAX_DECODE_ATTEMPTS = 5; // give up on a VIN NeoVIN can't decode (e.g. permanent 404)

export async function decodeUndecoded(limit = 60, deadline = 0) {
  const db = createServiceRoleClient();
  // Skip VINs that have already failed too many times, and try the
  // least-attempted first, so a handful of permanently-undecodable VINs can't
  // starve the per-run decode budget by being retried ahead of fresh VINs.
  // Over-fetch (limit*5) then dedupe to `limit` UNIQUE VINs. With the
  // (dealer_id, vin) PK a shared VIN has one row per dealer; without over-fetching,
  // a few popular shared VINs could fill the whole window and the run would decode
  // far fewer than `limit` distinct VINs. The .eq("vin") update fans out to every
  // dealer's copy, so one iteration per unique VIN is enough.
  const { data: rows } = await db.from("inventory")
    .select("vin,dealer_id,decode_attempts")
    .eq("options_decoded", false)
    .lt("decode_attempts", MAX_DECODE_ATTEMPTS)
    .order("decode_attempts", { ascending: true })
    .limit(limit * 5);
  const seenV = new Set<string>();
  const list = (rows || []).filter((r: any) => {
    if (!r.vin || seenV.has(r.vin)) return false;
    seenV.add(r.vin);
    return true;
  }).slice(0, limit);
  if (!list.length) return 0;
  // Import lazily to avoid a heavy module on the hot path.
  const { decodeVinOptionNames } = await import("@/lib/marketcheck");
  let done = 0;
  for (const row of list) {
    if (deadline && Date.now() > deadline) break; // out of budget → rest next run
    try {
      // throwOnError=true: a transient 429/5xx/timeout throws and we leave the VIN
      // undecoded to retry next run — instead of marking it decoded-with-no-options.
      const options = await decodeVinOptionNames(row.vin, true);
      await db.from("inventory").update({ options, options_decoded: true }).eq("vin", row.vin);
      done++;
    } catch {
      // Hard failure → record the attempt so a permanently-failing VIN backs off
      // after MAX_DECODE_ATTEMPTS instead of being retried forever every run.
      // Scope to THIS (dealer_id, vin) row, not .eq("vin") — fanning out would
      // overwrite other dealers' copies and could reset a higher counter.
      await db.from("inventory").update({ decode_attempts: (row.decode_attempts || 0) + 1 })
        .eq("dealer_id", row.dealer_id).eq("vin", row.vin);
    }
  }
  return done;
}

// ── Pick the stalest tracked dealers to refresh (never dumped, then oldest) ───
export async function stalestDealers(limit: number, olderThanMs = 5 * 3600_000) {
  const db = createServiceRoleClient();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { data } = await db.from("tracked_dealers")
    .select("dealer_id,name,city,state,last_dumped_at")
    .or(`last_dumped_at.is.null,last_dumped_at.lt.${cutoff}`)
    .order("last_dumped_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return data || [];
}

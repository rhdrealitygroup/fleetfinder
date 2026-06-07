import "server-only";
import { MC_HOST, mcKey, mcListing } from "@/lib/marketcheck";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Core of the inventory-dump pipeline. A deduped set of "tracked" dealers (every
// dealer any org has selected) is dumped into public.inventory; each car's
// options are decoded once and cached. The 6h cron refreshes listings + decodes
// new VINs; adding a dealer dumps its listings immediately.

const MC_PAGE = 100;
const MC_MAX_START = 1400; // keep start + rows <= 1500 (tier cap)

// ── Keep tracked_dealers in sync with the deduped union of org selections ────
export async function syncTrackedDealers() {
  const db = createServiceRoleClient();
  const { data: rows } = await db.from("dealers").select("dealer_key,name,city,state,selected");
  const selected = (rows || []).filter((d: any) => d.dealer_key && d.selected !== false);
  const seen = new Map<string, any>();
  for (const d of selected) if (!seen.has(d.dealer_key)) seen.set(d.dealer_key, d);

  const ids = [...seen.keys()];
  if (ids.length) {
    await db.from("tracked_dealers").upsert(
      [...seen.values()].map((d: any) => ({ dealer_id: d.dealer_key, name: d.name || null, city: d.city || null, state: d.state || null })),
      { onConflict: "dealer_id", ignoreDuplicates: true }, // don't reset last_dumped_at
    );
  }
  // Garbage-collect dealers no org selects anymore (and their inventory).
  const { data: tracked } = await db.from("tracked_dealers").select("dealer_id");
  const stale = (tracked || []).map((t: any) => t.dealer_id).filter((id: string) => !seen.has(id));
  if (stale.length) {
    await db.from("inventory").delete().in("dealer_id", stale);
    await db.from("tracked_dealers").delete().in("dealer_id", stale);
  }
  return ids.length;
}

// ── Dump one dealer's full inventory (fast: listings only, no decode) ─────────
export async function dumpDealerListings(dealerId: string, meta?: { name?: string; city?: string; state?: string }) {
  const apiKey = mcKey();
  if (!apiKey || !dealerId) return 0;
  const db = createServiceRoleClient();

  // Stamp every in-stock VIN this run with `runStart`; sold cars keep their older
  // updated_at and get swept below. Using a timestamp (not a NOT-IN VIN list)
  // avoids URL-length limits and malformed-VIN parsing issues.
  const runStart = new Date().toISOString();
  const rows: any[] = [];
  let complete = true; // false if any page fetch failed → don't sweep (avoid wiping on a transient 429)
  for (let start = 0; start <= MC_MAX_START; start += MC_PAGE) {
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("dealer_id", dealerId);
    u.searchParams.set("rows", String(MC_PAGE));
    u.searchParams.set("start", String(start));
    const r = await fetch(u.toString());
    if (!r.ok) { complete = false; break; }
    const d = await r.json();
    const list: any[] = d.listings || [];
    for (const l of list) {
      const v = mcListing(l);
      if (!v.vin || v.vin.length !== 17) continue;
      rows.push({
        vin: v.vin, dealer_id: dealerId,
        make: v.make || null, model: v.model || null, trim: v.trim || null, year: v.year || null,
        price: v.price || null, msrp: v.msrp || null, miles: v.mileage || null,
        exterior_color: v.exterior_color || null,
        car_type: l.inventory_type || (v.mileage > 100 ? "used" : "new"),
        payload: v, updated_at: runStart,
      });
    }
    if (list.length < MC_PAGE) break;
  }

  // Upsert listing fields only — omit options/options_decoded so already-decoded
  // VINs keep their cached options and new VINs default to undecoded.
  if (rows.length) await db.from("inventory").upsert(rows, { onConflict: "vin" });

  // Sweep sold cars — ONLY when the pull completed cleanly. A transient fetch
  // failure must never be read as "0 cars in stock" and wipe the dealer.
  if (complete) {
    await db.from("inventory").delete().eq("dealer_id", dealerId).lt("updated_at", runStart);
    await db.from("tracked_dealers").upsert(
      { dealer_id: dealerId, name: meta?.name || null, city: meta?.city || null, state: meta?.state || null, last_dumped_at: runStart, listing_count: rows.length },
      { onConflict: "dealer_id" },
    );
  } else {
    // Register the dealer but don't advance last_dumped_at, so it's retried soon.
    await db.from("tracked_dealers").upsert(
      { dealer_id: dealerId, name: meta?.name || null, city: meta?.city || null, state: meta?.state || null },
      { onConflict: "dealer_id", ignoreDuplicates: true },
    );
  }
  return rows.length;
}

// ── Decode options for VINs not yet decoded (the heavy step; batched) ─────────
export async function decodeUndecoded(limit = 60) {
  const db = createServiceRoleClient();
  const { data: rows } = await db.from("inventory").select("vin").eq("options_decoded", false).limit(limit);
  const vins = (rows || []).map((r: any) => r.vin).filter(Boolean);
  if (!vins.length) return 0;
  // Import lazily to avoid a heavy module on the hot path.
  const { decodeVinOptionNames } = await import("@/lib/marketcheck");
  let done = 0;
  for (const vin of vins) {
    try {
      const options = await decodeVinOptionNames(vin);
      await db.from("inventory").update({ options, options_decoded: true }).eq("vin", vin);
      done++;
    } catch { /* leave undecoded; retried next run */ }
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

// GET /api/cron/sync-dealers — rolling weekly refresh of the nationwide dealer
// directory. Each run refreshes the few stalest states (fits the function
// timeout); a daily Vercel Cron cycles through all 50 states over ~2 weeks,
// keeping the list fresh. The initial full population is done by a one-time
// script; this just keeps it current. Make tags are preserved (not in the
// upsert payload), so a dealer-list refresh never wipes them.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MC_HOST, mcKey, fetchWithTimeout } from "@/lib/marketcheck";

export const maxDuration = 60;

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDealer(x: any) {
  return {
    id: String(x.id), name: x.seller_name || "", street: x.street || "", city: x.city || "",
    state: x.state || "", zip: x.zip || "", phone: x.seller_phone || "", type: x.dealer_type || "",
    dealer_group: x.dealership_group_name || "", website: x.inventory_url || "",
    lat: x.latitude ? Number(x.latitude) : null, lng: x.longitude ? Number(x.longitude) : null,
    listing_count: Number(x.listing_count) || 0, synced_at: new Date().toISOString(),
  };
}

const DEALER_TYPES = ["franchise", "independent"] as const;
const PAGE = 50;
const CAP = 1500; // MarketCheck Standard-tier offset cap: start + rows must be ≤ 1500.

// Page ONE /dealers/car slice (state+type, optionally +city) up to the 1500
// offset cap, feeding each dealer to sink(). Returns num_found, clean-completion,
// rate-limit, and `saturated` (the slice hit the cap with a still-full last page,
// i.e. more dealers exist than we could page to → the caller should sub-partition).
async function pageDealers(
  apiKey: string,
  baseParams: Record<string, string>,
  sink: (x: any) => void,
  overBudget: () => boolean,
) {
  let numFound = 0, complete = true, rateLimited = false, saturated = false;
  for (let start = 0; start + PAGE <= CAP; start += PAGE) {
    if (overBudget()) { complete = false; break; }
    const u = new URL(`${MC_HOST}/dealers/car`);
    u.searchParams.set("api_key", apiKey);
    for (const [k, v] of Object.entries(baseParams)) u.searchParams.set(k, v);
    u.searchParams.set("rows", String(PAGE));
    u.searchParams.set("start", String(start));
    // Timeout → partial pull (don't advance the cursor) instead of hanging the
    // whole 60s function on one stuck upstream request.
    let r: Response;
    try { r = await fetchWithTimeout(u.toString()); }
    catch { complete = false; break; }
    if (r.status === 429) { complete = false; rateLimited = true; break; }
    if (!r.ok) { complete = false; break; }
    const d = await r.json();
    if (start === 0) numFound = Number(d.num_found) || 0;
    const ds: any[] = d.dealers || [];
    for (const x of ds) sink(x);
    if (ds.length < PAGE) return { numFound, complete, rateLimited, saturated: false };
    // A full last page AT the cap means there are dealers past offset 1500 we
    // can't reach with this filter — signal the caller to sub-partition by city.
    if (start + PAGE >= CAP) saturated = true;
  }
  return { numFound, complete, rateLimited, saturated };
}

// Returns the dealers AND whether the pull completed cleanly. A 429/5xx
// mid-pagination leaves `complete=false` so the caller won't mark the state
// freshly synced with a partial list (which would hide the rest for a full
// ~2-week rotation). Collected dealers are still upserted — we just retry the
// state next run instead of advancing its cursor.
//
// Saturated slices (state+type with >1500 dealers, e.g. NY/CA/TX/FL independents)
// are sub-partitioned by city: every city is far under the 1500 cap, so paging
// each city reaches the dealers past offset 1500 that the flat query can't. The
// city work is RESUMABLE — `startCursor` ("<type>|<city>") is where the previous
// run stopped; we rebuild the same deterministic work list and skip past it.
// Returns `cursor` = the new "<type>|<city>" to persist (more city work remains)
// or null (everything pulled / no saturation).
async function pullState(state: string, apiKey: string, deadline = 0, startCursor: string | null = null) {
  const out = new Map<string, any>();
  // Cities observed PER TYPE, so a saturated slice partitions over its own cities.
  const citiesByType: Record<string, Set<string>> = { franchise: new Set(), independent: new Set() };
  let complete = true;
  let rateLimited = false;
  let cursor: string | null = null;
  // Reserve margin for one in-flight fetch (12s timeout) + the trailing DB write,
  // so the LAST request started before the budget can't run past maxDuration's
  // hard kill. Stop ~13s before the deadline rather than right at it.
  const FETCH_MARGIN_MS = 13_000;
  const overBudget = () => deadline > 0 && Date.now() > deadline - FETCH_MARGIN_MS;

  for (const type of DEALER_TYPES) {
    if (rateLimited || overBudget()) { complete = false; break; }
    const sink = (x: any) => {
      out.set(String(x.id), mapDealer(x));
      if (x.city) citiesByType[type].add(String(x.city));
    };
    // Flat pull (always) — also discovers the city list for this type.
    const flat = await pageDealers(apiKey, { state, dealer_type: type }, sink, overBudget);
    if (flat.rateLimited) rateLimited = true;
    if (!flat.complete) { complete = false; if (rateLimited) break; continue; }

    // Not saturated → the flat pull captured every dealer; nothing to partition.
    if (!flat.saturated) continue;

    // Saturated → page each observed city (sorted for a deterministic, resumable
    // order). Resume after startCursor if it targets THIS type.
    const cityList = [...citiesByType[type]].sort();
    const resumeCity = startCursor && startCursor.startsWith(`${type}|`)
      ? startCursor.slice(type.length + 1) : null;
    for (const city of cityList) {
      if (resumeCity && city <= resumeCity) continue; // already done in a prior run
      if (overBudget()) { complete = false; cursor = `${type}|${city}`; break; }
      const cr = await pageDealers(apiKey, { state, dealer_type: type, city }, sink, overBudget);
      if (cr.rateLimited) { rateLimited = true; complete = false; cursor = `${type}|${city}`; break; }
      if (!cr.complete) { complete = false; cursor = `${type}|${city}`; break; }
    }
    if (cursor || rateLimited) break; // ran out of budget mid-partition → resume next run
  }

  // Typeless reconciliation: a few dealers can carry an empty dealer_type that the
  // franchise/independent passes structurally miss. A cheap rows=0 probe gives the
  // true state total; we only pull the (untyped-inclusive) no-type slice when the
  // gap exceeds facet-count noise — so the common case (≈12-dealer wobble) costs a
  // single probe, while a genuine bucket of untyped dealers is recovered.
  if (complete && !rateLimited && !cursor && !overBudget()) {
    try {
      const u0 = new URL(`${MC_HOST}/dealers/car`);
      u0.searchParams.set("api_key", apiKey);
      u0.searchParams.set("state", state);
      u0.searchParams.set("rows", "0");
      const r0 = await fetchWithTimeout(u0.toString());
      if (r0.ok) {
        const trueTotal = Number((await r0.json()).num_found) || 0;
        const TYPELESS_NOISE = 20; // MarketCheck facet counts wobble by a handful
        if (trueTotal - out.size > TYPELESS_NOISE) {
          const sink = (x: any) => { out.set(String(x.id), mapDealer(x)); };
          const rec = await pageDealers(apiKey, { state }, sink, overBudget);
          if (!rec.complete) complete = false;
        }
      }
    } catch { /* best-effort: typeless recovery never fails the state sync */ }
  }
  return { dealers: [...out.values()], complete, rateLimited, cursor };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = mcKey();
  if (!apiKey) return NextResponse.json({ error: "MARKETCHECK_API_KEY not set" }, { status: 500 });
  const db = createServiceRoleClient();

  // ── Opt-in makes backfill ─────────────────────────────────────────────────
  // /dealers/car carries no make breakdown, so the picker's make filter is only
  // precise for dealers we've tagged. This populates `makes` per dealer from the
  // cheap make facet ($0.002/dealer). It is MANUAL ONLY (never the scheduled cron)
  // because it spends one call per dealer — call ?backfill_makes=1&state=NJ&limit=250
  // repeatedly until `remaining` hits 0. Stocked dealers are tagged first.
  if (url.searchParams.get("backfill_makes")) {
    const state = (url.searchParams.get("state") || "").toUpperCase();
    const limit = Math.min(600, Math.max(1, Number(url.searchParams.get("limit")) || 250));
    let q = db.from("dealer_catalog").select("id,listing_count", { count: "exact" })
      .or("makes.is.null,makes.eq.{}").gt("listing_count", 0)
      .order("listing_count", { ascending: false }).limit(limit);
    if (state) q = q.eq("state", state);
    const { data: todo, count } = await q;
    const deadline = Date.now() + 45_000;
    let tagged = 0;
    for (const d of todo || []) {
      if (Date.now() > deadline) break;
      try {
        const u = new URL(`${MC_HOST}/search/car/active`);
        u.searchParams.set("api_key", apiKey);
        u.searchParams.set("dealer_id", String(d.id));
        u.searchParams.set("car_type", "new");
        u.searchParams.set("rows", "0");
        u.searchParams.set("facets", "make");
        const r = await fetchWithTimeout(u.toString());
        if (!r.ok) continue;
        const j = await r.json();
        const makes = (j.facets?.make || []).map((t: any) => String(t.item || "").trim()).filter(Boolean);
        // Store [] sentinel-free: only write a non-empty list, else mark with a
        // single "—" so we don't re-probe a genuinely makeless dealer forever.
        await db.from("dealer_catalog").update({ makes: makes.length ? makes : ["—"] }).eq("id", d.id);
        tagged++;
      } catch { /* skip; next run retries */ }
    }
    return NextResponse.json({ backfill_makes: true, state: state || "ALL", tagged, remaining: Math.max(0, (count || 0) - tagged) });
  }

  // Pick the next states to refresh, in priority order:
  //   1. never-synced states (initial population),
  //   2. states mid city-partition (city_cursor set) — finish them over the next
  //      few runs so a saturated state's tail completes promptly instead of
  //      waiting out a full ~2-week rotation,
  //   3. everyone else, oldest synced_at first.
  const { data: rows } = await db.from("dealer_sync_state").select("state,synced_at,city_cursor");
  const synced = new Map((rows || []).map((r: any) => [r.state, r]));
  const cursors = new Map((rows || []).map((r: any) => [r.state, (r.city_cursor as string) || null]));
  const neverSynced = STATES.filter((s) => !synced.has(s));
  const inProgress = STATES.filter((s) => synced.has(s) && cursors.get(s));
  const rest = [...synced.values()]
    .filter((r: any) => !r.city_cursor)
    .sort((a: any, b: any) => +new Date(a.synced_at) - +new Date(b.synced_at))
    .map((r: any) => r.state);
  const ordered = [...neverSynced, ...inProgress, ...rest];
  const batchSize = Math.max(1, Number(url.searchParams.get("batch")) || 3);
  const batch = ordered.slice(0, batchSize);

  // Wall-clock budget so the run finishes within maxDuration (60s) instead of
  // being hard-killed mid-state (which wastes the fetched pages and stalls the
  // cursor).
  const startedAt = Date.now();
  const BUDGET_MS = 45_000;

  const refreshed: { state: string; n: number; complete: boolean; resuming: boolean }[] = [];
  for (const st of batch) {
    if (Date.now() - startedAt > BUDGET_MS) break; // out of time → next run picks up the rest
    const startCursor = cursors.get(st) || null;
    const { dealers, complete, rateLimited, cursor } = await pullState(st, apiKey, startedAt + BUDGET_MS, startCursor);
    if (dealers.length) {
      // Upsert without `makes` → existing make tags are preserved on update.
      await db.from("dealer_catalog").upsert(dealers, { onConflict: "id" });
    }
    if (cursor) {
      // Saturated state, more city work remains. Persist the resume point and
      // advance synced_at (so it doesn't also count as never-synced); the non-null
      // city_cursor keeps it in the priority-2 group so the tail finishes over the
      // next few runs. Don't overwrite `count` with a partial tally.
      await db.from("dealer_sync_state").upsert({ state: st, synced_at: new Date().toISOString(), city_cursor: cursor });
    } else if (complete) {
      // Fully pulled (flat fit within the cap, or the city partition finished).
      // Clear any resume cursor and record the count. Advance synced_at even on a
      // genuinely-empty state so it can't sort first forever and block rotation.
      await db.from("dealer_sync_state").upsert({ state: st, synced_at: new Date().toISOString(), count: dealers.length, city_cursor: null });
    }
    // else: a flat-pull failure (timeout/429) with no cursor → leave the row as-is
    // and retry next run.
    refreshed.push({ state: st, n: dealers.length, complete, resuming: !!cursor });
    if (rateLimited) break; // MarketCheck rate-limited → stop the batch; next run retries
  }
  return NextResponse.json({ ok: true, refreshed });
}

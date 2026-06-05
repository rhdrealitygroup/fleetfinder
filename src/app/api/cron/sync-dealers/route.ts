// GET /api/cron/sync-dealers — rolling weekly refresh of the nationwide dealer
// directory. Each run refreshes the few stalest states (fits the function
// timeout); a daily Vercel Cron cycles through all 50 states over ~2 weeks,
// keeping the list fresh. The initial full population is done by a one-time
// script; this just keeps it current. Make tags are preserved (not in the
// upsert payload), so a dealer-list refresh never wipes them.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MC_HOST, mcKey } from "@/lib/marketcheck";

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

async function pullState(state: string, apiKey: string) {
  const out = new Map<string, any>();
  for (const type of ["franchise", "independent"]) {
    for (let start = 0; start < 1500; start += 50) {
      const u = new URL(`${MC_HOST}/dealers/car`);
      u.searchParams.set("api_key", apiKey);
      u.searchParams.set("state", state);
      u.searchParams.set("dealer_type", type);
      u.searchParams.set("rows", "50");
      u.searchParams.set("start", String(start));
      const r = await fetch(u.toString());
      if (!r.ok) break;
      const d = await r.json();
      const ds: any[] = d.dealers || [];
      for (const x of ds) out.set(String(x.id), mapDealer(x));
      if (ds.length < 50) break;
    }
  }
  return [...out.values()];
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

  // Pick the stalest states: never-synced first, then oldest synced_at.
  const { data: rows } = await db.from("dealer_sync_state").select("state,synced_at");
  const seen = new Map((rows || []).map((r: any) => [r.state, r.synced_at]));
  const pending = STATES.filter((s) => !seen.has(s));
  const ordered = pending.length
    ? pending
    : [...seen.entries()].sort((a, b) => +new Date(a[1]) - +new Date(b[1])).map((e) => e[0]);
  const batchSize = Math.max(1, Number(url.searchParams.get("batch")) || 3);
  const batch = ordered.slice(0, batchSize);

  const refreshed: { state: string; n: number }[] = [];
  for (const st of batch) {
    const dealers = await pullState(st, apiKey);
    if (dealers.length) {
      // Upsert without `makes` → existing make tags are preserved on update.
      await db.from("dealer_catalog").upsert(dealers, { onConflict: "id" });
      await db.from("dealer_sync_state").upsert({ state: st, synced_at: new Date().toISOString(), count: dealers.length });
      refreshed.push({ state: st, n: dealers.length });
    }
  }
  return NextResponse.json({ ok: true, refreshed });
}

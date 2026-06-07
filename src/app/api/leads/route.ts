// POST /api/leads — PUBLIC consumer lead capture from the /usedcar site.
// Stores the enquiry (name/contact + the car) for the referral pipeline.
// Writes via the service role; leads RLS denies all other access.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { cacheGet, cacheSet, MIN } from "@/lib/memoryCache";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rateLimited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const key = `rl:leads:${ip}:${Math.floor(Date.now() / 60000)}`;
  const n = (cacheGet<number>(key) || 0) + 1;
  cacheSet(key, n, MIN);
  return n > 10; // 10 leads/min/IP
}

export async function POST(req: Request) {
  if (rateLimited(req)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim();
  const phone = String(b.phone || "").trim();
  if (!name || (!email && !phone)) {
    return NextResponse.json({ error: "Name and an email or phone are required." }, { status: 400 });
  }
  const v = b.vehicle || {};
  const row = {
    name, email: email || null, phone: phone || null,
    vin: String(b.vin || v.vin || "").trim() || null,
    vehicle: v,
    dealer_id: String(b.dealer_id || "").trim() || null,
    dealer_name: String(v.dealer || b.dealer_name || "").trim() || null,
    message: String(b.message || "").slice(0, 1000) || null,
    source: "usedcar",
  };
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from("leads").insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

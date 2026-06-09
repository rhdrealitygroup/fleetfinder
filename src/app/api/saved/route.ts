// Per-AGENT saved vehicles + named lists (a list is just payload.list).
//   GET                              → this agent's saved vehicles
//   POST   { vehicle, list? }        → save (default list "Saved")
//   DELETE { id }                    → remove that one saved row
//   DELETE { vin, list? }            → remove a VIN from ONE list (default
//                                      "Saved"); never touches other lists
//   DELETE { vin, allLists:true }    → remove a VIN from every list
// Stored in public.saved_vehicles (RLS: owning user only).

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const { user, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized", saved: [] }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_vehicles")
    .select("id,vin,payload,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const saved = (data || []).map((r: any) => ({ id: r.id, vin: r.vin, list: r.payload?.list || "Saved", ...(r.payload || {}) }));
  const lists = Array.from(new Set(saved.map((s: any) => s.list))).sort();
  return NextResponse.json({ saved, lists, membership });
}

export async function POST(req: Request) {
  const { user, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership?.org_id || (await ensureOrgForUser())?.org_id || null;
  const body = await req.json().catch(() => ({}));
  const vehicle = body.vehicle || {};
  const list = String(body.list || "Saved").trim() || "Saved";
  const vin = String(vehicle.vin || "").trim() || null;
  const supabase = await createClient();
  // De-dupe: same VIN in the same list for this user is updated, not duplicated.
  if (vin) {
    const { data: dup } = await supabase.from("saved_vehicles").select("id,payload").eq("user_id", user.id).eq("vin", vin);
    const match = (dup || []).find((d: any) => (d.payload?.list || "Saved") === list);
    if (match) {
      await supabase.from("saved_vehicles").update({ payload: { ...vehicle, list } }).eq("id", match.id);
      return NextResponse.json({ ok: true, id: match.id });
    }
  }
  const { data, error } = await supabase
    .from("saved_vehicles")
    .insert({ user_id: user.id, org_id: orgId, vin, payload: { ...vehicle, list } })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req: Request) {
  const { user } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const supabase = await createClient();
  let qb = supabase.from("saved_vehicles").delete().eq("user_id", user.id);
  if (body.id) {
    qb = qb.eq("id", String(body.id));
  } else if (body.vin) {
    qb = qb.eq("vin", String(body.vin));
    // Scope to a single list unless the caller explicitly asks for all lists.
    // Without this, un-starring a VIN in search would wipe it from EVERY named
    // customer list (data loss). `payload->>list` defaults to "Saved".
    if (!body.allLists) {
      const list = String(body.list || "Saved").trim() || "Saved";
      if (list === "Saved") {
        // Also match legacy rows where payload.list is null — the GET normalises
        // those to "Saved", so the user sees them under Saved and expects to delete
        // them from there. `eq` alone would silently miss null rows.
        qb = qb.or("payload->>list.eq.Saved,payload->>list.is.null");
      } else {
        qb = qb.eq("payload->>list", list);
      }
    }
  } else {
    return NextResponse.json({ error: "id or vin required" }, { status: 400 });
  }
  await qb;
  return NextResponse.json({ ok: true });
}

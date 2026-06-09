// Customer profiles (per agent). Save a customer + what they're shopping for,
// so an agent can walk back in and re-run the search. Stored in public.customers
// (org-scoped RLS, tagged with agent_id; default 7-day expiry from the schema).
//   GET                         → this agent's customers
//   POST   { id?, name, phone?, email?, notes?, needs? } → create/update
//   DELETE { id }               → remove

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const { user } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized", customers: [] }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id,name,phone,email,notes,needs,expires_at,created_at")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ customers: data || [] });
}

export async function POST(req: Request) {
  const { user, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = membership?.org_id || (await ensureOrgForUser())?.org_id || null;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const row: any = {
    org_id: orgId, agent_id: user.id, name,
    phone: b.phone || null, email: b.email || null, notes: b.notes || null,
    needs: b.needs || {},
  };
  const supabase = await createClient();
  if (b.id) {
    // maybeSingle() returns data=null (no error) when 0 rows matched — which means
    // the customer either doesn't exist or belongs to a different agent (RLS scopes
    // to this agent's org). Return 404 instead of a misleading ok:true.
    const { data: updated, error } = await supabase.from("customers").update(row).eq("id", b.id).eq("agent_id", user.id).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  const { data, error } = await supabase.from("customers").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req: Request) {
  const { user } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = await createClient();
  await supabase.from("customers").delete().eq("id", String(b.id)).eq("agent_id", user.id);
  return NextResponse.json({ ok: true });
}

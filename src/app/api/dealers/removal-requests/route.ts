// Agent dealer-removal requests. Agents can't remove a company dealer directly
// (owner/admin only) — they request it here; an owner/admin approves (which
// removes it) or dismisses.
//   GET                          → owner/admin: pending requests for their org
//   POST   { dealer_key, name? } → any member: request a removal
//   PATCH  { id, action }        → owner/admin: 'approve' | 'dismiss'

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

async function ctx() {
  const { user, membership } = await getSessionContext();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (!membership) return { error: "No organization" as const, status: 400 };
  return { user, org: membership.org_id, role: membership.role as string };
}

export async function GET() {
  const c = await ctx();
  if ("error" in c) return NextResponse.json({ error: c.error, requests: [] }, { status: c.status });
  if (!["owner", "admin"].includes(c.role)) return NextResponse.json({ requests: [] }); // agents don't see the queue
  const db = createServiceRoleClient();
  const { data } = await db.from("dealer_removal_requests")
    .select("id,dealer_key,dealer_name,requested_by_email,created_at")
    .eq("org_id", c.org).eq("status", "pending").order("created_at", { ascending: true });
  return NextResponse.json({ requests: data || [] });
}

export async function POST(req: Request) {
  const c = await ctx();
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const b = await req.json().catch(() => ({}));
  const dealer_key = String(b.dealer_key || "").trim();
  if (!dealer_key) return NextResponse.json({ error: "dealer_key required" }, { status: 400 });
  const db = createServiceRoleClient();
  // De-dupe: one pending request per dealer per org.
  const { data: dup } = await db.from("dealer_removal_requests")
    .select("id").eq("org_id", c.org).eq("dealer_key", dealer_key).eq("status", "pending").limit(1);
  if (!dup?.length) {
    await db.from("dealer_removal_requests").insert({
      org_id: c.org, dealer_key, dealer_name: b.name || null,
      requested_by: c.user.id, requested_by_email: c.user.email, status: "pending",
    });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  if (!["owner", "admin"].includes(c.role)) return NextResponse.json({ error: "Only an owner or admin can act on requests" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  const action = b.action;
  if (!id || !["approve", "dismiss"].includes(action)) return NextResponse.json({ error: "id and action (approve|dismiss) required" }, { status: 400 });
  const db = createServiceRoleClient();
  // Only act on a still-pending request (avoids re-removing a re-added dealer via a stale request).
  const { data: r } = await db.from("dealer_removal_requests").select("dealer_key").eq("id", id).eq("org_id", c.org).eq("status", "pending").maybeSingle();
  if (!r) return NextResponse.json({ error: "Request not found or already handled" }, { status: 404 });
  if (action === "approve") {
    await db.from("dealers").update({ selected: false }).eq("org_id", c.org).eq("dealer_key", r.dealer_key);
    await db.from("dealer_removal_requests").update({ status: "approved" }).eq("id", id);
  } else {
    await db.from("dealer_removal_requests").update({ status: "dismissed" }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}

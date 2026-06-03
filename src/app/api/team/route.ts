// Team management — owner/admin add or remove agents on their org.
//   POST   { email, first_name?, last_name? }  → invite + create membership
//   DELETE { membership_id }                    → remove agent (not the owner)

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "Only owners/admins can add agents" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const db = createServiceRoleClient();

  // Invite (or fetch) the auth user.
  let userId: string | null = null;
  const invite = await db.auth.admin.inviteUserByEmail(email).catch(() => null);
  if (invite?.data?.user) {
    userId = invite.data.user.id;
  } else {
    // Already exists — look them up via the profiles table by email.
    const { data: prof } = await db.from("profiles").select("id").eq("email", email).limit(1);
    userId = prof?.[0]?.id || null;
  }
  if (!userId) return NextResponse.json({ error: "Could not invite that email" }, { status: 400 });

  const { error } = await db.from("memberships").insert({
    org_id: membership.org_id, user_id: userId, role: "agent",
    first_name: body.first_name || null, last_name: body.last_name || null, email,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That person is already on the team" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.membership_id || "");
  if (!id) return NextResponse.json({ error: "membership_id required" }, { status: 400 });

  const supabase = await createClient();
  // Verify the target belongs to this org and isn't the owner.
  const { data: target } = await supabase.from("memberships").select("id, role, org_id").eq("id", id).single();
  if (!target || target.org_id !== membership.org_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "Can't remove the owner" }, { status: 400 });

  const { error } = await createServiceRoleClient().from("memberships").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

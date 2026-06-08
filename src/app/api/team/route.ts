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

  // Seat limit: don't let an org exceed its paid agent_limit (billing integrity).
  // Exempt: (1) comped orgs — complimentary, never run checkout (agent_limit stays
  // at the default 1); (2) orgs still on the free trial — let them build their team
  // before subscribing. Trial-added agents are billed when they convert (checkout
  // floors the paid seat count at the current agent count).
  const { data: org } = await db.from("organizations").select("agent_limit, comped, plan_status, stripe_subscription_id, trial_ends_at").eq("id", membership.org_id).single();
  // Exempt comped orgs, and orgs on an ACTIVE app-trial (no Stripe sub yet AND the
  // trial window hasn't passed). An EXPIRED trial must respect the seat limit —
  // otherwise it could add unlimited agents for free forever. A paid sub in its
  // Stripe trial also has plan_status='trial' but already carries a paid limit.
  const appTrialActive = org?.plan_status === "trial" && !org?.stripe_subscription_id
    && (!org?.trial_ends_at || Date.parse(org.trial_ends_at as string) > Date.now());
  const exemptFromSeatLimit = !!org?.comped || appTrialActive;
  if (!exemptFromSeatLimit) {
    const { count: seatCount } = await db.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id);
    // agent_limit is TOTAL seats and already includes the owner (the webhook sets
    // it to 1 + paid-seat-quantity). Do NOT add another +1 here, or every org gets
    // one free agent beyond what it pays for.
    const limit = org?.agent_limit ?? 1;
    if ((seatCount ?? 0) >= limit) {
      return NextResponse.json({ error: `Seat limit reached (${limit}). Add seats in Billing to invite more agents.` }, { status: 402 });
    }
  }

  // Invite (or fetch) the auth user.
  let userId: string | null = null;
  const invite = await db.auth.admin.inviteUserByEmail(email).catch(() => null);
  if (invite?.data?.user) {
    userId = invite.data.user.id;
  } else {
    // Already exists — look them up via the profiles table by email. profiles.email
    // is now locked (migration 0014: clients can't write it; kept in sync with
    // auth.users), so it's authoritative. Still reject an ambiguous match rather
    // than nondeterministically picking one row.
    const { data: prof } = await db.from("profiles").select("id").eq("email", email);
    if (prof && prof.length > 1) return NextResponse.json({ error: "That email is ambiguous — contact support." }, { status: 409 });
    userId = prof?.[0]?.id || null;
  }
  if (!userId) return NextResponse.json({ error: "Could not invite that email" }, { status: 400 });
  // Consent guard for ALL resolution paths — inviteUserByEmail can return an
  // already-registered user, so checking only the lookup branch let an existing
  // member of another company be force-joined. Never do that.
  const { data: other } = await db.from("memberships").select("id").eq("user_id", userId).neq("org_id", membership.org_id).limit(1);
  if (other?.length) return NextResponse.json({ error: "That person already belongs to another company." }, { status: 409 });

  const { error } = await db.from("memberships").insert({
    org_id: membership.org_id, user_id: userId, role: "agent",
    first_name: body.first_name || null, last_name: body.last_name || null, email,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That person is already on the team" }, { status: 409 });
    // Seat-limit trigger fires as a check_violation (23514) if a concurrent invite
    // raced past the pre-check — return the same 402 the UI already handles.
    if (error.code === "23514" || /seat limit reached/i.test(error.message || "")) {
      return NextResponse.json({ error: "Seat limit reached. Add seats in Billing to invite more agents." }, { status: 402 });
    }
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

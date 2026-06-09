// POST /api/account/finalize — called by the onboarding page when the user
// returns from Stripe Checkout. Confirms (against Stripe, the source of truth)
// that the owner's org now has a live subscription / card on file, opens the
// onboarding gate (user_metadata.onboarded), and mirrors the sub onto the org so
// the app is usable immediately without waiting for the webhook to land.
//
// Returns { ok: true } when the gate is opened, or { ok: false, pending: true }
// when no subscription is visible yet (the client polls briefly, then asks the
// user to refresh).

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST() {
  const { user, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();

  // Flip the onboarding gate open WITHOUT clobbering existing metadata (read the
  // current metadata and merge — robust whether the admin API merges or replaces).
  const markDone = async () => {
    const { data: u } = await db.auth.admin.getUserById(user.id);
    const meta = { ...(u?.user?.user_metadata || {}), profile_complete: true, onboarded: true };
    await db.auth.admin.updateUserById(user.id, { user_metadata: meta });
  };

  const orgId = membership?.org_id;
  if (!orgId) return NextResponse.json({ ok: false, pending: true });

  const { data: org } = await db.from("organizations")
    .select("id, comped, stripe_customer_id, stripe_subscription_id")
    .eq("id", orgId).single();
  if (!org) return NextResponse.json({ ok: false, pending: true });

  // No card needed in these cases — open the gate straight away.
  if (org.comped || org.stripe_subscription_id || !stripeConfigured()) {
    await markDone();
    return NextResponse.json({ ok: true });
  }

  // Ask Stripe directly whether a live subscription now exists for this customer
  // (the sub exists the instant Checkout completes, ahead of our webhook).
  if (org.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({ customer: org.stripe_customer_id as string, status: "all", limit: 10 });
      const live = subs.data.find((s) => ["trialing", "active", "past_due", "unpaid", "paused"].includes(s.status));
      if (live) {
        const planStatus = live.status === "trialing" ? "trial" : live.status === "active" ? "active" : live.status;
        const patch: Record<string, unknown> = { stripe_subscription_id: live.id, plan_status: planStatus, trial_used: true };
        if (live.status === "trialing" && typeof live.trial_end === "number") {
          patch.trial_ends_at = new Date(live.trial_end * 1000).toISOString();
        }
        // Claim the pointer only if still empty so we never fight the webhook's
        // atomic claim (both converge on the same sub id either way).
        await db.from("organizations").update(patch).eq("id", org.id).is("stripe_subscription_id", null);
        await markDone();
        return NextResponse.json({ ok: true });
      }
    } catch { /* fall through to pending — the client will retry */ }
  }

  return NextResponse.json({ ok: false, pending: true });
}

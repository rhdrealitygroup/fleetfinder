// POST /api/stripe/cancel — owner cancels (or resumes) their subscription.
// Body: { resume?: boolean }
//   default → schedule cancellation at period end (cancel_at_period_end = true).
//             For a trialing sub this means it ends when the trial does and is
//             NEVER charged. For an active sub, access continues until the paid
//             period ends, then stops.
//   resume  → undo a scheduled cancellation (cancel_at_period_end = false).
//
// We cancel at period end (not immediately) so the customer keeps the access
// they've already paid for / the remaining free trial. The webhook mirrors
// cancel_at_period_end into the DB; we also write it here so the UI updates
// without waiting for the event.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });

  const resume = (await req.json().catch(() => ({})))?.resume === true;

  const db = createServiceRoleClient();
  const { data: org } = await db.from("organizations")
    .select("stripe_subscription_id, plan_status").eq("id", membership.org_id).single();
  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: "No subscription to cancel. You're on the free trial — no card on file, so nothing will be charged." }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id as string);
    if (!["active", "trialing", "past_due", "unpaid", "paused"].includes(sub.status)) {
      return NextResponse.json({ error: "This subscription is already canceled." }, { status: 409 });
    }
    const updated: any = await stripe.subscriptions.update(org.stripe_subscription_id as string, {
      cancel_at_period_end: !resume,
    });
    // Mirror to the DB immediately for instant UI feedback. Do NOT stamp
    // last_sub_event_at from the local clock — if the server clock runs ahead of
    // Stripe's, every later real webhook would be rejected by the out-of-order
    // guard. The authoritative cancel event from Stripe will set the column from
    // its own event time, and the ordering guard rejects any genuinely older event.
    await db.from("organizations")
      .update({ cancel_at_period_end: !resume })
      .eq("id", membership.org_id);

    const endTs = updated.trial_end ?? updated.items?.data?.[0]?.current_period_end ?? updated.current_period_end ?? null;
    return NextResponse.json({
      ok: true,
      canceled: !resume,
      trialing: updated.status === "trialing",
      effectiveEnd: typeof endTs === "number" ? new Date(endTs * 1000).toISOString() : null,
    });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't update the subscription: ${(e as Error).message}` }, { status: 502 });
  }
}

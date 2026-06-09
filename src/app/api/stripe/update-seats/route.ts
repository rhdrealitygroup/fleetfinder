// POST /api/stripe/update-seats — owner adjusts the paid agent-seat count on
// their active subscription. Changes take effect at the NEXT billing cycle
// (proration_behavior: "none") so there's no surprise mid-cycle charge.
//
// Body: { seats: number }   — new total additional-agent seat count (0+).
//
// Guards:
//   • Owner-only (billing is an owner action).
//   • seats >= current team size − 1 (can't drop below the agents already on
//     the team — they'd be over-limit the moment the new period started).
//   • Subscription must be live (active / trialing / past_due / unpaid / paused).
//   • STRIPE_PRICE_SEAT must be configured — otherwise there's nothing to set.
//
// The resulting subscription.updated webhook reconciles agent_limit in the DB,
// so this route intentionally does NOT write to the DB directly.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured, seatPriceId, PRICING } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"] as const;

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const priceId = seatPriceId();
  if (!priceId) return NextResponse.json({ error: "Seat billing isn't configured — contact support." }, { status: 503 });

  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const seats = Math.min(1000, Math.max(0, Math.floor(Number(body.seats) || 0)));
  if (isNaN(seats)) return NextResponse.json({ error: "Invalid seat count" }, { status: 400 });

  const db = createServiceRoleClient();

  // Fetch the org to get the current subscription id.
  const { data: org } = await db.from("organizations")
    .select("stripe_subscription_id, plan_status, monthly_price_override")
    .eq("id", membership.org_id).single();
  if (!org?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription found — subscribe first." }, { status: 400 });
  }

  // Fail-closed team-size guard: can't drop below the current team size or
  // agents already on the team would be over their seat limit at next cycle.
  // A PostgREST count of null (transient error) must NOT silently floor to 0
  // and allow an under-seat update — that would strand agents.
  const { count: teamCount, error: countErr } = await db.from("memberships")
    .select("id", { count: "exact", head: true }).eq("org_id", membership.org_id);
  if (countErr || teamCount == null) {
    return NextResponse.json({ error: "Couldn't verify your team size — please try again." }, { status: 503 });
  }
  const minSeats = Math.max(0, teamCount - 1); // seats = total team minus the owner
  if (seats < minSeats) {
    return NextResponse.json({
      error: `You have ${teamCount - 1} agent${teamCount - 1 === 1 ? "" : "s"} on your team — seat count can't go below ${minSeats}.`,
    }, { status: 409 });
  }

  const stripe = getStripe();

  // Retrieve the live subscription.
  let sub: any;
  try {
    sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id as string);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't reach Stripe: ${(e as Error).message}` }, { status: 502 });
  }
  if (!LIVE_STATUSES.includes(sub.status)) {
    return NextResponse.json({ error: "This subscription is no longer active." }, { status: 409 });
  }

  // Find the seat line item (there may be none if they subscribed at 0 seats).
  const seatItem = (sub.items?.data || []).find((i: any) => i.price?.id === priceId);
  const currentQty: number = seatItem?.quantity ?? 0;

  // No-op: already at the requested count.
  if (currentQty === seats) {
    const baseMonthly = org.monthly_price_override != null ? org.monthly_price_override : PRICING.basePriceUsd;
    return NextResponse.json({ ok: true, seats, monthly: baseMonthly + seats * PRICING.seatPriceUsd, unchanged: true });
  }

  // Apply the change. proration_behavior:"none" means no immediate charge;
  // the new amount applies from the next billing cycle.
  //
  // Idempotency key includes the FROM→TO transition (and sub id), not just the
  // target seat count. A key of just (org, seats) breaks on a repeated value:
  // Stripe caches keys ~24h and REPLAYS the cached response without re-executing,
  // so e.g. 3→5→3 within a day would replay the old "3" success and silently leave
  // the sub at 5 (billing the owner for seats the UI says they removed). Keying on
  // currentQty→seats makes every real transition unique while still deduping a
  // genuine rapid double-click of the same change.
  const idemKey = `update-seats-${membership.org_id}-${org.stripe_subscription_id}-${currentQty}to${seats}`;
  try {
    if (seatItem) {
      // Update the existing seat item.
      await stripe.subscriptions.update(org.stripe_subscription_id as string, {
        items: [{ id: seatItem.id, quantity: seats }],
        proration_behavior: "none",
      }, { idempotencyKey: idemKey });
    } else if (seats > 0) {
      // No seat item yet — add one (org subscribed at 0 extra seats).
      await stripe.subscriptions.update(org.stripe_subscription_id as string, {
        items: [{ price: priceId, quantity: seats }],
        proration_behavior: "none",
      }, { idempotencyKey: idemKey });
    }
    // seats === 0 && !seatItem: already at 0 extra seats, nothing to update
    // (we short-circuited the no-op check above, so this path only runs if the
    // current qty somehow differs from 0 without a seat item — shouldn't happen).
  } catch (e) {
    return NextResponse.json({ error: `Couldn't update seats: ${(e as Error).message}` }, { status: 502 });
  }

  const baseMonthly = org.monthly_price_override != null ? org.monthly_price_override : PRICING.basePriceUsd;
  return NextResponse.json({ ok: true, seats, monthly: baseMonthly + seats * PRICING.seatPriceUsd });
}

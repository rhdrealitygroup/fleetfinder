// POST /api/stripe/webhook — Stripe event sink. Keeps each org's plan_status,
// subscription id, and agent_limit in sync with Stripe. Verifies the signature
// against STRIPE_WEBHOOK_SECRET. Idempotent: always derives state from the
// event payload, never increments.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type Stripe from "stripe";

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "no webhook secret" }, { status: 503 });

  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Signature verification failed: ${(e as Error).message}` }, { status: 400 });
  }

  const db = createServiceRoleClient();

  async function syncSubscription(sub: Stripe.Subscription, isDeleted = false, eventCreated = 0) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const orgId = (sub.metadata?.org_id as string) || null;

    // Locate the org row first (by metadata, else by Stripe customer id).
    const sel = "id, plan_status, stripe_subscription_id, last_sub_event_at";
    const { data: org } = orgId
      ? await db.from("organizations").select(sel).eq("id", orgId).maybeSingle()
      : typeof sub.customer === "string"
        ? await db.from("organizations").select(sel).eq("stripe_customer_id", sub.customer).maybeSingle()
        : { data: null as any };
    if (!org) return;

    // Out-of-order guard by EVENT TIME: Stripe doesn't guarantee delivery order.
    // Reject any event older than the last one we applied to this org — this
    // stops a stale `active`/`updated` event from un-canceling a canceled sub
    // (which a status-only guard couldn't catch).
    if (eventCreated && org.last_sub_event_at && eventCreated * 1000 < Date.parse(org.last_sub_event_at)) return;

    const status = isDeleted ? "canceled"
      : sub.status === "trialing" ? "trial"
      : sub.status === "active" ? "active"
      : sub.status === "past_due" ? "past_due"
      : sub.status === "canceled" ? "canceled" : sub.status;

    const patch: Record<string, any> = {
      stripe_subscription_id: sub.id,
      plan_status: status,
    };

    // Seats: base qty=1 + seat price qty=N → agent_limit = 1 + N. Only derive
    // this when the seat price is actually configured — otherwise a missing/
    // misconfigured STRIPE_PRICE_SEAT would silently force every org to 1 seat
    // and kick out paid agents. When unset, leave agent_limit untouched.
    if (process.env.STRIPE_PRICE_SEAT) {
      let agentLimit = 1;
      for (const item of sub.items.data) {
        if (item.price.id === process.env.STRIPE_PRICE_SEAT) agentLimit = 1 + (item.quantity || 0);
      }
      patch.agent_limit = agentLimit;
    }

    // Persist trial end + current billing period end so the UI can show a real
    // date and the server gate can enforce trial expiry.
    if (typeof sub.trial_end === "number") patch.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
    const periodEnd = (sub.items?.data?.[0] as any)?.current_period_end ?? (sub as any).current_period_end;
    if (typeof periodEnd === "number") patch.current_period_end = new Date(periodEnd * 1000).toISOString();
    if (eventCreated) patch.last_sub_event_at = new Date(eventCreated * 1000).toISOString();

    await db.from("organizations").update(patch).eq("id", org.id);
  }

  switch (event.type) {
    case "customer.subscription.created": {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const sub = event.data.object as Stripe.Subscription;
      // Duplicate-subscription guard (completion-time): if this org already has a
      // DIFFERENT live subscription, this new one is a race duplicate (two
      // checkouts completed before the first webhook landed) — cancel it and keep
      // the original rather than silently billing the customer twice.
      const orgId = (sub.metadata?.org_id as string) || null;
      const { data: org } = orgId
        ? await db.from("organizations").select("id, stripe_subscription_id").eq("id", orgId).maybeSingle()
        : typeof sub.customer === "string"
          ? await db.from("organizations").select("id, stripe_subscription_id").eq("stripe_customer_id", sub.customer).maybeSingle()
          : { data: null as any };
      const existingId = org?.stripe_subscription_id as string | undefined;
      if (existingId && existingId !== sub.id) {
        try {
          const existing = await stripe.subscriptions.retrieve(existingId);
          if (["active", "trialing", "past_due", "unpaid", "paused"].includes(existing.status)) {
            await stripe.subscriptions.cancel(sub.id); // drop the duplicate, keep the original
            break;
          }
        } catch { /* existing sub gone in Stripe → adopt this new one below */ }
      }
      await syncSubscription(sub, false, event.created);
      break;
    }
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription, false, event.created);
      break;
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription, true, event.created);
      break;
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription && typeof s.subscription === "string") {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await syncSubscription(sub, false, event.created); // freshly retrieved → live status
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

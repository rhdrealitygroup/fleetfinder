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

  async function syncSubscription(sub: Stripe.Subscription) {
    const orgId = (sub.metadata?.org_id as string) || null;
    // Count seats: base price qty=1 + seat price qty=N → agent_limit = 1 + N
    let agentLimit = 1;
    for (const item of sub.items.data) {
      if (item.price.id === process.env.STRIPE_PRICE_SEAT) agentLimit = 1 + (item.quantity || 0);
    }
    const status = sub.status === "trialing" ? "trial"
      : sub.status === "active" ? "active"
      : sub.status === "past_due" ? "past_due"
      : sub.status === "canceled" ? "canceled" : sub.status;

    const patch = {
      stripe_subscription_id: sub.id,
      plan_status: status,
      agent_limit: agentLimit,
    };
    if (orgId) await db.from("organizations").update(patch).eq("id", orgId);
    else if (typeof sub.customer === "string") await db.from("organizations").update(patch).eq("stripe_customer_id", sub.customer);
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription && typeof s.subscription === "string") {
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        await syncSubscription(sub);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

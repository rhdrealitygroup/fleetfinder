// POST /api/stripe/checkout — start a subscription checkout for the caller's
// organization. Body: { seats?: number } (additional agents beyond the owner).
// Creates/links a Stripe customer on the org and returns a Checkout URL.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured, basePriceId, seatPriceId, PRICING } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!stripeConfigured() || !basePriceId()) {
    return NextResponse.json({ error: "Billing not configured yet" }, { status: 503 });
  }
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const seats = Math.max(0, Number(body.seats) || 0);

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("*").eq("id", membership.org_id).single();
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const stripe = getStripe();
  const origin = new URL(req.url).origin;

  // Guard against creating a SECOND live subscription. The UI hides the button
  // when already subscribed, but this endpoint is directly POST-able and a stale
  // page (webhook not yet applied) could re-submit — Stripe would happily bill
  // the customer twice. If a usable sub already exists, send them to the portal.
  if (org.stripe_subscription_id) {
    try {
      const existing = await stripe.subscriptions.retrieve(org.stripe_subscription_id as string);
      if (["active", "trialing", "past_due", "paused", "unpaid"].includes(existing.status)) {
        return NextResponse.json(
          { error: "You already have a subscription. Manage seats from the billing portal.", alreadySubscribed: true },
          { status: 409 },
        );
      }
    } catch { /* sub id stale / deleted in Stripe → allow a fresh checkout */ }
  }

  // Ensure a Stripe customer exists for this org.
  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: org.name,
      metadata: { org_id: org.id },
    });
    customerId = customer.id;
    await createServiceRoleClient().from("organizations").update({ stripe_customer_id: customerId }).eq("id", org.id);
  }

  // Base price: a per-org custom monthly price overrides the standard one.
  let basePrice = basePriceId();
  if (org.monthly_price_override && org.monthly_price_override > 0) {
    let customPriceId = org.stripe_custom_price_id as string | null;
    if (!customPriceId) {
      const p = await stripe.prices.create({
        unit_amount: Math.round(org.monthly_price_override * 100),
        currency: "usd",
        recurring: { interval: "month" },
        product_data: { name: `LotCompass — ${org.name} (custom)` },
      });
      customPriceId = p.id;
      await createServiceRoleClient().from("organizations").update({ stripe_custom_price_id: customPriceId }).eq("id", org.id);
    }
    basePrice = customPriceId;
  }

  const line_items = [{ price: basePrice, quantity: 1 }];
  if (seats > 0 && seatPriceId()) line_items.push({ price: seatPriceId(), quantity: seats });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items,
    subscription_data: { trial_period_days: PRICING.trialDays, metadata: { org_id: org.id } },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}

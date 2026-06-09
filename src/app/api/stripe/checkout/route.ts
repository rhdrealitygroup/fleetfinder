// POST /api/stripe/checkout — start a subscription checkout for the caller's
// organization. Body: { seats?: number } (additional agents beyond the owner).
// Creates/links a Stripe customer on the org and returns a Checkout URL.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured, basePriceId, seatPriceId, PRICING } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { applyRefereeCredit, creditReferrerIfPossible } from "@/lib/referrals";

export async function POST(req: Request) {
  if (!stripeConfigured() || !basePriceId()) {
    return NextResponse.json({ error: "Billing not configured yet" }, { status: 503 });
  }
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // Clamp the client-supplied seat count — this endpoint is directly POST-able, so
  // an unbounded value would let someone bill themselves arbitrarily.
  const requestedSeats = Math.min(1000, Math.max(0, Math.floor(Number(body.seats) || 0)));
  // Where to return after the hosted page. Onboarding (the signup card gate) needs
  // to land back on /onboarding to finish setup; everywhere else returns to billing.
  const fromOnboarding = body.context === "onboarding";

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("*").eq("id", membership.org_id).single();
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  // A trial org can add agents before subscribing, so bill for at least the
  // agents already on the team (members minus the owner). Otherwise those agents
  // would convert to a paid plan unbilled. A FAILED count must NOT silently floor
  // to 0 (that would underbill) — treat it as a transient error and let them retry.
  const { count: memberCount, error: countErr } = await createServiceRoleClient()
    .from("memberships").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id);
  if (countErr || memberCount == null) {
    return NextResponse.json({ error: "Couldn't verify your team size — please try again." }, { status: 503 });
  }
  const currentAgents = Math.max(0, memberCount - 1);
  const seats = Math.min(1000, Math.max(requestedSeats, currentAgents));

  // Comped orgs get free access (auth.ts grants it) — starting a paid checkout
  // would charge them for something they were given for free. Block it.
  if (org.comped) return NextResponse.json({ error: "This account has complimentary access — no subscription needed.", comped: true }, { status: 409 });

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
    }, { idempotencyKey: `customer-${org.id}` }); // collapse concurrent first-checkouts into one customer
    customerId = customer.id;
    await createServiceRoleClient().from("organizations").update({ stripe_customer_id: customerId }).eq("id", org.id);
  }

  // Referral credits ($50/$50). If this org was referred, drop their $50 welcome
  // credit onto the customer now so it applies to the first invoice. Also flush
  // any referrer reward this org earned before it had a Stripe customer.
  if (org.referred_by_org) await applyRefereeCredit(stripe, org.id as string, customerId);
  await creditReferrerIfPossible(stripe, org.id as string);

  // Stripe-side dedup: the DB stripe_subscription_id is written only by the
  // webhook, so in the window between a checkout completing and the webhook
  // landing it's still null and the DB guard above is skipped. Ask Stripe
  // directly whether this customer already has a live sub before creating a
  // second one (Stripe allows multiple subs per customer → double-billing).
  // Always run it (a just-created customer simply returns an empty list).
  {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const live = subs.data.find((s) => ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status));
    if (live) {
      return NextResponse.json(
        { error: "You already have a subscription. Manage seats from the billing portal.", alreadySubscribed: true },
        { status: 409 },
      );
    }
  }

  // Base price: a per-org custom monthly price overrides the standard one. Use
  // != null (not truthiness) so an intentional $0 override yields a $0 custom
  // price instead of silently falling through to the standard $100.
  let basePrice = basePriceId();
  if (org.monthly_price_override != null) {
    let customPriceId = org.stripe_custom_price_id as string | null;
    if (!customPriceId) {
      const cents = Math.round(org.monthly_price_override * 100);
      const priceBody = {
        unit_amount: cents,
        currency: "usd" as const,
        recurring: { interval: "month" as const },
        product_data: { name: `LotCompass — ${org.name} (custom)` },
      };
      let p = await stripe.prices.create(priceBody, { idempotencyKey: `custom-price-${org.id}-${cents}` }); // dedupe concurrent first-checkout submits
      if (!p.active) p = await stripe.prices.create(priceBody); // idempotency replayed an archived price → mint fresh
      customPriceId = p.id;
      await createServiceRoleClient().from("organizations").update({ stripe_custom_price_id: customPriceId }).eq("id", org.id);
    }
    basePrice = customPriceId;
  }

  // If this org owes for agents (seats) but the seat price isn't configured, FAIL
  // rather than silently creating a base-only subscription — that would convert
  // trial-added agents to a paid plan completely unbilled.
  if (seats > 0 && !seatPriceId()) {
    return NextResponse.json({ error: "Seat billing isn't configured yet — contact support before subscribing." }, { status: 503 });
  }
  const line_items = [{ price: basePrice, quantity: 1 }];
  if (seats > 0) line_items.push({ price: seatPriceId()!, quantity: seats });

  // Trial: continue the org's EXISTING app trial (set at org creation) rather
  // than granting a fresh 14 days on top — otherwise a new org gets ~14 app-trial
  // days + 14 Stripe-trial days = ~28 free. Never trialed → full 14; already used
  // (resubscribe) or expired → none (charged immediately).
  let trialDays: number | undefined;   // flat trial when there's no app-trial date
  let trialEnd: number | undefined;    // absolute end (continue the existing app trial to the exact instant)
  if (!org.trial_used) {
    if (org.trial_ends_at) {
      const endTs = Math.floor(Date.parse(org.trial_ends_at as string) / 1000);
      // Only set when comfortably in the future (Stripe needs a future timestamp);
      // an already-expired app trial → no Stripe trial (charged immediately).
      if (endTs > Math.floor(Date.now() / 1000) + 60) trialEnd = endTs;
    } else {
      trialDays = PRICING.trialDays;
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items,
    subscription_data: {
      ...(trialEnd ? { trial_end: trialEnd } : trialDays ? { trial_period_days: trialDays } : {}),
      metadata: { org_id: org.id },
    },
    // Require a card even though the first 14 days are free — this is the signup
    // card gate. 'always' collects a payment method during the trial so the sub
    // auto-converts when the trial ends. ('if_required' would skip it for trials.)
    payment_method_collection: "always",
    success_url: `${origin}${fromOnboarding ? "/onboarding" : "/account/billing"}?checkout=success`,
    cancel_url: `${origin}${fromOnboarding ? "/onboarding" : "/account/billing"}?checkout=cancelled`,
    allow_promotion_codes: true,
    // Expire the hosted page after 30 min. The idempotency key includes seats, so
    // re-opening checkout with a DIFFERENT seat count mints a separate session;
    // a short expiry shrinks the window where two seat-variant sessions sit open
    // and could both be completed into duplicate live subs. (The webhook's
    // duplicate-sub guard + atomic-claim is still the primary backstop.)
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  }, { idempotencyKey: `checkout-${org.id}-${basePrice}-${seats}-t${trialEnd ?? trialDays ?? 0}` }); // dedupe rapid double-submits; include trial so a post-trial retry can't replay a stale-trial session

  return NextResponse.json({ url: session.url });
}

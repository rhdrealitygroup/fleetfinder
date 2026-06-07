// POST /api/stripe/setup-products — one-time: create the LotCompass product +
// the two recurring prices ($100/mo base, $15/mo per seat). Returns the price
// IDs to paste into env (STRIPE_PRICE_BASE, STRIPE_PRICE_SEAT).
//
// Super-admin only. Idempotent-ish: reuses a product with the same name.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured, PRICING } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";

export async function POST() {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 500 });
  }
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Idempotency guard: if both price IDs are already configured, don't mint a
  // fresh duplicate pair on every call (orphaned prices accumulate in Stripe).
  if (process.env.STRIPE_PRICE_BASE && process.env.STRIPE_PRICE_SEAT) {
    return NextResponse.json({
      ok: true,
      alreadyConfigured: true,
      STRIPE_PRICE_BASE: process.env.STRIPE_PRICE_BASE,
      STRIPE_PRICE_SEAT: process.env.STRIPE_PRICE_SEAT,
      note: "Prices already configured in env. Nothing created.",
    });
  }

  const stripe = getStripe();

  // Find or create the product.
  const existing = await stripe.products.search({ query: `name:'LotCompass Subscription'` }).catch(() => null);
  const product = existing?.data?.[0]
    ? existing.data[0]
    : await stripe.products.create({
        name: "LotCompass Subscription",
        description: "Cross-brand lease inventory search for leasing agents.",
      });

  // Reuse an existing matching recurring price on this product rather than
  // minting a duplicate on every call (env may be half-set on a first deploy).
  const existingPrices = await stripe.prices.list({ product: product.id, active: true, limit: 100 }).catch(() => null);
  const findPrice = (cents: number) =>
    existingPrices?.data?.find((p) => p.unit_amount === cents && p.currency === "usd" && p.recurring?.interval === "month");
  async function findOrCreate(cents: number, nickname: string) {
    const hit = findPrice(cents);
    if (hit) return hit;
    return stripe.prices.create({
      product: product.id, currency: "usd", unit_amount: cents,
      recurring: { interval: "month" }, nickname,
    });
  }
  const base = await findOrCreate(PRICING.basePriceUsd * 100, "Company base");
  const seat = await findOrCreate(PRICING.seatPriceUsd * 100, "Additional agent seat");

  return NextResponse.json({
    ok: true,
    product: product.id,
    STRIPE_PRICE_BASE: base.id,
    STRIPE_PRICE_SEAT: seat.id,
    note: "Add STRIPE_PRICE_BASE and STRIPE_PRICE_SEAT to your env vars, then redeploy.",
  });
}

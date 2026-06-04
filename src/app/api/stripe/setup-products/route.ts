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
  const { isSuperAdmin } = await getSessionContext();
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stripe = getStripe();

  // Find or create the product.
  const existing = await stripe.products.search({ query: `name:'LotCompass Subscription'` }).catch(() => null);
  const product = existing?.data?.[0]
    ? existing.data[0]
    : await stripe.products.create({
        name: "LotCompass Subscription",
        description: "Cross-brand lease inventory search for leasing agents.",
      });

  const base = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PRICING.basePriceUsd * 100,
    recurring: { interval: "month" },
    nickname: "Company base",
  });
  const seat = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PRICING.seatPriceUsd * 100,
    recurring: { interval: "month" },
    nickname: "Additional agent seat",
  });

  return NextResponse.json({
    ok: true,
    product: product.id,
    STRIPE_PRICE_BASE: base.id,
    STRIPE_PRICE_SEAT: seat.id,
    note: "Add STRIPE_PRICE_BASE and STRIPE_PRICE_SEAT to your env vars, then redeploy.",
  });
}

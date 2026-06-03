import "server-only";
import Stripe from "stripe";

// Stripe client + plan config. Activates as soon as STRIPE_SECRET_KEY is set
// in env — until then, helpers no-op / report "not configured" so the rest of
// the app keeps working.

export const PRICING = {
  basePriceUsd: 100, // per company / month
  seatPriceUsd: 15, // per additional agent / month
  trialDays: 14,
};

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-05-27.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// Price IDs are created by /api/stripe/setup-products and stored in env.
export function basePriceId() {
  return process.env.STRIPE_PRICE_BASE || "";
}
export function seatPriceId() {
  return process.env.STRIPE_PRICE_SEAT || "";
}

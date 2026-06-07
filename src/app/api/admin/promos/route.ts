// Super-admin promo management. Creates Stripe coupons + customer-facing
// promotion codes (redeemable at checkout, which already sets
// allow_promotion_codes). Platform-admin only.
//   GET                 → list promotion codes + their discount + usage
//   POST { ...promo }   → create a coupon + promotion code
//   PATCH { id, active } → activate / deactivate a promotion code
//
// Promo shape (POST):
//   code?            string   (uppercased; Stripe auto-generates if omitted)
//   kind             "percent" | "amount"
//   value            number   (percent 1-100, or whole dollars off)
//   duration         "once" | "repeating" | "forever"   (default "once")
//   durationMonths?  number   (required when duration === "repeating")
//   maxRedemptions?  number
//   expiresInDays?   number

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import type Stripe from "stripe";

async function requireSuperAdmin() {
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (!isSuperAdmin) return { error: "Forbidden", status: 403 as const };
  return { ok: true as const };
}

function shape(p: Stripe.PromotionCode, couponOverride?: Stripe.Coupon) {
  // In this API version the coupon lives at promotion.coupon (string id unless
  // expanded). On create we pass the freshly-created coupon object directly.
  const pc = (p.promotion as { coupon?: string | Stripe.Coupon } | undefined)?.coupon;
  const c = couponOverride || (pc && typeof pc === "object" ? pc : null);
  return {
    id: p.id,
    code: p.code,
    active: p.active,
    percent_off: c?.percent_off ?? null,
    amount_off: c?.amount_off != null ? c.amount_off / 100 : null,
    duration: c?.duration ?? null,
    duration_in_months: c?.duration_in_months ?? null,
    times_redeemed: p.times_redeemed,
    max_redemptions: p.max_redemptions ?? null,
    expires_at: p.expires_at ?? null,
    created: p.created,
  };
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error, promos: [] }, { status: gate.status });
  if (!stripeConfigured()) return NextResponse.json({ promos: [], error: "Stripe not configured" });
  try {
    const stripe = getStripe();
    const list = await stripe.promotionCodes.list({ limit: 100, expand: ["data.promotion.coupon"] });
    return NextResponse.json({ promos: list.data.map((p) => shape(p)) });
  } catch (e) {
    return NextResponse.json({ promos: [], error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!stripeConfigured()) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const kind = b.kind === "amount" ? "amount" : "percent";
  const value = Number(b.value);
  const duration = ["once", "repeating", "forever"].includes(b.duration) ? b.duration : "once";

  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: "Enter a discount value greater than 0." }, { status: 400 });
  }
  if (kind === "percent" && value > 100) {
    return NextResponse.json({ error: "Percent discount can't exceed 100." }, { status: 400 });
  }
  const durationMonths = Number(b.durationMonths);
  if (duration === "repeating" && (!Number.isFinite(durationMonths) || durationMonths < 1)) {
    return NextResponse.json({ error: "Repeating discounts need a number of months." }, { status: 400 });
  }

  try {
    const stripe = getStripe();

    // 1) The coupon defines the discount.
    const couponParams: Stripe.CouponCreateParams = { duration };
    if (kind === "percent") couponParams.percent_off = value;
    else { couponParams.amount_off = Math.round(value * 100); couponParams.currency = "usd"; }
    if (duration === "repeating") couponParams.duration_in_months = durationMonths;
    const coupon = await stripe.coupons.create(couponParams);

    // 2) The promotion code is what customers type at checkout.
    const promoParams: Stripe.PromotionCodeCreateParams = { promotion: { type: "coupon", coupon: coupon.id } };
    const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code) promoParams.code = code;
    const maxRedemptions = Number(b.maxRedemptions);
    if (Number.isFinite(maxRedemptions) && maxRedemptions >= 1) promoParams.max_redemptions = Math.floor(maxRedemptions);
    const expiresInDays = Number(b.expiresInDays);
    if (Number.isFinite(expiresInDays) && expiresInDays >= 1) {
      promoParams.expires_at = Math.floor(Date.now() / 1000) + Math.floor(expiresInDays) * 86400;
    }

    const promo = await stripe.promotionCodes.create(promoParams);
    return NextResponse.json({ ok: true, promo: shape(promo, coupon) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!stripeConfigured()) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const stripe = getStripe();
    const promo = await stripe.promotionCodes.update(id, { active: !!b.active });
    return NextResponse.json({ ok: true, promo: shape(promo) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

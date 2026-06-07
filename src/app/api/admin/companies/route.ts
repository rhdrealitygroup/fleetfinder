// Super-admin company controls. Platform-admin only.
//   PATCH { id, comped }                 → set/unset free access
//   PATCH { id, monthlyPriceOverride }   → custom $/mo (null clears → standard)

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe, stripeConfigured, basePriceId, seatPriceId } from "@/lib/stripe";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function PATCH(req: Request) {
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = createServiceRoleClient();
  const { data: org } = await db.from("organizations").select("id,name,stripe_subscription_id,monthly_price_override,stripe_custom_price_id,comped").eq("id", id).maybeSingle();
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const COMP_COUPON = "lotcompass_comp_100";
  // Every status that can still collect money (now or on resume) — matches
  // checkout/webhook. Reconcile coupons/prices for all of these, not just the
  // active trio, or an unpaid/paused sub keeps a stale comp coupon on resume.
  const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"];
  // Reduce a Stripe discount object to the update-shape, preserving promo codes.
  const asDiscountInput = (d: any) => {
    if (!d || typeof d === "string") return null;
    if (d.promotion_code) return { promotion_code: typeof d.promotion_code === "string" ? d.promotion_code : d.promotion_code.id };
    const c = typeof d.coupon === "string" ? d.coupon : d.coupon?.id;
    return c ? { coupon: c } : null;
  };

  const patch: Record<string, any> = {};

  // ── Comp toggle: reconcile Stripe BEFORE persisting comped, so a Stripe
  // failure can never leave comped=true in the DB (free app access) while the
  // customer keeps getting charged. comped is added to the patch only after the
  // Stripe side succeeds (or there's nothing to bill). ──────────────────────
  const compChanged = typeof b.comped === "boolean" && b.comped !== !!org.comped;
  if (compChanged) {
    if (org.stripe_subscription_id && stripeConfigured()) {
      try {
        const stripe = getStripe();
        const sub: any = await stripe.subscriptions.retrieve(org.stripe_subscription_id, { expand: ["discounts"] });
        if (LIVE_STATUSES.includes(sub.status)) {
          // Keep any real promo/coupon the customer already has; only add/remove
          // OUR comp coupon (clearing all discounts would wipe a paid promo).
          const others = (sub.discounts || [])
            .filter((d: any) => (typeof d === "string" ? d : d?.coupon?.id || d?.coupon) !== COMP_COUPON)
            .map(asDiscountInput)
            .filter(Boolean);
          if (b.comped) {
            try { await stripe.coupons.retrieve(COMP_COUPON); }
            catch { await stripe.coupons.create({ id: COMP_COUPON, percent_off: 100, duration: "forever", name: "LotCompass complimentary" }); }
            await stripe.subscriptions.update(org.stripe_subscription_id, { discounts: [...others, { coupon: COMP_COUPON }] });
          } else {
            // In this Stripe API version an EMPTY ARRAY leaves discounts unchanged;
            // only "" actually clears them. Use "" when no real promo remains, else
            // re-set the preserved promos.
            await stripe.subscriptions.update(org.stripe_subscription_id, { discounts: others.length ? others : "" });
          }
        }
        // Stripe reconciled (or status not billable → nothing to charge): safe to persist.
        patch.comped = b.comped;
      } catch (e) {
        // Do NOT persist comped — return an error so the admin retries, rather
        // than silently granting free access while billing continues.
        return NextResponse.json({ error: `Couldn't update Stripe billing — comp not changed: ${(e as Error).message}` }, { status: 502 });
      }
    } else {
      // No live subscription / Stripe not configured → nothing to reconcile.
      patch.comped = b.comped;
    }
  }

  let priceChanged = false;
  if ("monthlyPriceOverride" in b) {
    const v = b.monthlyPriceOverride;
    let next: number | null = null;
    if (!(v === null || v === "")) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
      next = Math.round(n);
    }
    // Only touch price columns / Stripe when the amount actually changed —
    // avoids spawning orphaned Stripe prices on repeated saves.
    if (next !== (org.monthly_price_override ?? null)) {
      patch.monthly_price_override = next;
      patch.stripe_custom_price_id = null; // force a fresh Stripe price
      priceChanged = true;
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, id, unchanged: true });

  const { error } = await db.from("organizations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // If the custom price changed AND the org has a live subscription, push the
  // new base price to Stripe (otherwise it'd only apply at a checkout the
  // existing subscriber never runs → silent mischarge).
  if (priceChanged && org.stripe_subscription_id && stripeConfigured()) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      if (LIVE_STATUSES.includes(sub.status)) {
        const seat = seatPriceId();
        const baseItem = sub.items.data.find((i: any) => i.price?.id !== seat) || sub.items.data[0];
        if (baseItem) {
          const oldCustomPriceId = org.stripe_custom_price_id as string | null;
          let newPriceId = basePriceId(); // clearing the override → standard price
          if (patch.monthly_price_override != null) {
            const cents = Math.round(patch.monthly_price_override * 100);
            const p = await stripe.prices.create({
              unit_amount: cents,
              currency: "usd",
              recurring: { interval: "month" },
              product_data: { name: `LotCompass — ${org.name || "company"} (custom)` },
            }, { idempotencyKey: `custom-price-${id}-${cents}` }); // dedupe concurrent saves
            newPriceId = p.id;
            await db.from("organizations").update({ stripe_custom_price_id: newPriceId }).eq("id", id);
          }
          if (newPriceId) {
            await stripe.subscriptions.update(org.stripe_subscription_id, {
              items: [{ id: baseItem.id, price: newPriceId }],
              proration_behavior: "create_prorations",
            });
            // Archive the prior custom price so orphaned active prices don't pile
            // up in Stripe on each override change (billing already repointed).
            if (oldCustomPriceId && oldCustomPriceId !== newPriceId) {
              await stripe.prices.update(oldCustomPriceId, { active: false }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      // Roll the price columns back to their prior values so the DB never claims
      // a price Stripe isn't actually charging (avoids DB↔Stripe drift).
      await db.from("organizations")
        .update({ monthly_price_override: org.monthly_price_override ?? null, stripe_custom_price_id: org.stripe_custom_price_id ?? null })
        .eq("id", id);
      return NextResponse.json({ error: `Couldn't update the live subscription — price change reverted: ${(e as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true, id });
}

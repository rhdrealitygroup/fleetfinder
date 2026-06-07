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
  const { data: org } = await db.from("organizations").select("id,name,stripe_subscription_id,monthly_price_override,comped").eq("id", id).maybeSingle();
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const patch: Record<string, any> = {};
  if (typeof b.comped === "boolean") patch.comped = b.comped;

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
      if (["active", "trialing", "past_due"].includes(sub.status)) {
        const seat = seatPriceId();
        const baseItem = sub.items.data.find((i: any) => i.price?.id !== seat) || sub.items.data[0];
        if (baseItem) {
          let newPriceId = basePriceId(); // clearing the override → standard price
          if (patch.monthly_price_override != null) {
            const p = await stripe.prices.create({
              unit_amount: Math.round(patch.monthly_price_override * 100),
              currency: "usd",
              recurring: { interval: "month" },
              product_data: { name: `LotCompass — ${org.name || "company"} (custom)` },
            });
            newPriceId = p.id;
            await db.from("organizations").update({ stripe_custom_price_id: newPriceId }).eq("id", id);
          }
          if (newPriceId) {
            await stripe.subscriptions.update(org.stripe_subscription_id, {
              items: [{ id: baseItem.id, price: newPriceId }],
              proration_behavior: "create_prorations",
            });
          }
        }
      }
    } catch (e) {
      return NextResponse.json({ ok: true, id, warning: `Saved, but updating the live subscription failed: ${(e as Error).message}` });
    }
  }

  // Comp toggle → reflect it in Stripe. Marking an org "comped" must actually
  // stop charges; otherwise a paying customer keeps getting billed for something
  // we told them is free. We apply a 100%-off forever coupon (rather than
  // canceling) so the subscription — and the org — stays visible, just at $0.
  if (typeof b.comped === "boolean" && b.comped !== !!org.comped && org.stripe_subscription_id && stripeConfigured()) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      if (["active", "trialing", "past_due"].includes(sub.status)) {
        if (b.comped) {
          const couponId = "lotcompass_comp_100";
          try { await stripe.coupons.retrieve(couponId); }
          catch { await stripe.coupons.create({ id: couponId, percent_off: 100, duration: "forever", name: "LotCompass complimentary" }); }
          await stripe.subscriptions.update(org.stripe_subscription_id, { discounts: [{ coupon: couponId }] });
        } else {
          await stripe.subscriptions.update(org.stripe_subscription_id, { discounts: [] });
        }
      }
    } catch (e) {
      return NextResponse.json({ ok: true, id, warning: `Saved, but updating Stripe billing failed: ${(e as Error).message}` });
    }
  }
  return NextResponse.json({ ok: true, id });
}

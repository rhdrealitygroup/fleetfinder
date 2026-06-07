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

  const patch: Record<string, any> = {};
  if (typeof b.comped === "boolean") patch.comped = b.comped;
  if ("monthlyPriceOverride" in b) {
    const v = b.monthlyPriceOverride;
    if (v === null || v === "") {
      patch.monthly_price_override = null;
      patch.stripe_custom_price_id = null; // back to standard price
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
      patch.monthly_price_override = Math.round(n);
      patch.stripe_custom_price_id = null; // amount changed → force a fresh Stripe price at next checkout
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const db = createServiceRoleClient();
  const { data: org } = await db.from("organizations").select("id,name,stripe_subscription_id").eq("id", id).maybeSingle();
  const { error } = await db.from("organizations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // If the custom price changed AND the org already has a live subscription,
  // push the new base price to Stripe — otherwise the change would only apply at
  // the next checkout (which an existing subscriber never runs → silent mischarge).
  if ("monthly_price_override" in patch && org?.stripe_subscription_id && stripeConfigured()) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
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
            proration_behavior: "none",
          });
        }
      }
    } catch (e) {
      return NextResponse.json({ ok: true, id, warning: `Saved, but updating the live subscription failed: ${(e as Error).message}` });
    }
  }
  return NextResponse.json({ ok: true, id });
}

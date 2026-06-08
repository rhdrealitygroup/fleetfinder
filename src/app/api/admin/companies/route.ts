// Super-admin company controls. Platform-admin only.
//   PATCH { id, comped }                 → set/unset free access
//   PATCH { id, monthlyPriceOverride }   → custom $/mo (null clears → standard)

import { NextResponse } from "next/server";
import { getSessionContext, isSuperAdminEmail } from "@/lib/auth";
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
  const { data: org } = await db.from("organizations").select("id,name,stripe_subscription_id,stripe_customer_id,monthly_price_override,stripe_custom_price_id,comped").eq("id", id).maybeSingle();
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
    if (stripeConfigured() && (org.stripe_subscription_id || org.stripe_customer_id)) {
      try {
        const stripe = getStripe();
        // Resolve the live subscription. The DB stripe_subscription_id is written
        // only by the webhook, so it can lag a fresh checkout — fall back to
        // listing the customer's subscriptions so a comp during that window still
        // attaches the coupon (otherwise the customer keeps getting charged).
        let subId = org.stripe_subscription_id as string | null;
        let sub: any = null;
        if (subId) {
          sub = await stripe.subscriptions.retrieve(subId, { expand: ["discounts"] });
        } else if (org.stripe_customer_id) {
          const subs = await stripe.subscriptions.list({ customer: org.stripe_customer_id as string, status: "all", limit: 10, expand: ["data.discounts"] });
          sub = subs.data.find((s: any) => LIVE_STATUSES.includes(s.status)) || null;
          subId = sub?.id || null;
        }
        if (sub && subId && LIVE_STATUSES.includes(sub.status)) {
          // Keep any real promo/coupon the customer already has; only add/remove
          // OUR comp coupon (clearing all discounts would wipe a paid promo).
          const others = (sub.discounts || [])
            .filter((d: any) => (typeof d === "string" ? d : d?.coupon?.id || d?.coupon) !== COMP_COUPON)
            .map(asDiscountInput)
            .filter(Boolean);
          if (b.comped) {
            try { await stripe.coupons.retrieve(COMP_COUPON); }
            catch { await stripe.coupons.create({ id: COMP_COUPON, percent_off: 100, duration: "forever", name: "LotCompass complimentary" }); }
            await stripe.subscriptions.update(subId, { discounts: [...others, { coupon: COMP_COUPON }] });
          } else {
            // In this Stripe API version an EMPTY ARRAY leaves discounts unchanged;
            // only "" actually clears them. Use "" when no real promo remains, else
            // re-set the preserved promos.
            await stripe.subscriptions.update(subId, { discounts: others.length ? others : "" });
          }
        }
        // Stripe reconciled (or no live sub → nothing to charge): safe to persist.
        patch.comped = b.comped;
      } catch (e) {
        // Do NOT persist comped — return an error so the admin retries, rather
        // than silently granting free access while billing continues.
        return NextResponse.json({ error: `Couldn't update Stripe billing — comp not changed: ${(e as Error).message}` }, { status: 502 });
      }
    } else {
      // No Stripe customer/subscription at all / Stripe not configured → nothing to reconcile.
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
    let createdPriceId: string | null = null; // declared out here so the catch can archive it
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
            const priceBody = {
              unit_amount: cents,
              currency: "usd" as const,
              recurring: { interval: "month" as const },
              product_data: { name: `LotCompass — ${org.name || "company"} (custom)` },
            };
            let p = await stripe.prices.create(priceBody, { idempotencyKey: `custom-price-${id}-${cents}` }); // dedupe concurrent saves
            // If the idempotency key replays a now-archived price (same amount
            // re-applied within 24h after a change), mint a fresh active one —
            // repointing the sub to an inactive price would fail.
            if (!p.active) p = await stripe.prices.create(priceBody);
            newPriceId = p.id;
            createdPriceId = p.id; // remember the freshly-minted price for cleanup on failure
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
      // Archive the price we just minted (the sub was never repointed to it) so a
      // failed change doesn't leak an orphaned active price in Stripe.
      if (createdPriceId) { try { await getStripe().prices.update(createdPriceId, { active: false }); } catch { /* best-effort */ } }
      return NextResponse.json({ error: `Couldn't update the live subscription — price change reverted: ${(e as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true, id });
}

// DELETE { id } → permanently remove a company: cancels its Stripe subscription
// (so billing stops), deletes the org (cascades memberships, customers, dealers,
// saved_vehicles, removal requests), and deletes each member's auth login if that
// member no longer belongs to any other company. Super-admin only.
export async function DELETE(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = createServiceRoleClient();
  // Never let an admin delete ANY company they belong to (not just their primary
  // one — getSessionContext only returns the earliest membership, so checking that
  // alone would let a super-admin delete a second org they're a member of and nuke
  // their own login). Check every membership for this user.
  {
    const { data: mine } = await db.from("memberships").select("org_id").eq("user_id", ctx.user.id);
    if ((mine || []).some((m) => m.org_id === id)) {
      return NextResponse.json({ error: "You can't delete a company you belong to." }, { status: 400 });
    }
  }
  const { data: org } = await db.from("organizations")
    .select("id,name,stripe_subscription_id,stripe_customer_id").eq("id", id).maybeSingle();
  if (!org) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Capture members BEFORE deleting the org (the delete cascades memberships away).
  const { data: members } = await db.from("memberships").select("user_id,email").eq("org_id", id);
  const roster = (members || []).filter((m) => m.user_id);

  // Stop billing first — cancel any live subscription so a deleted company never
  // keeps getting charged. Best-effort; a Stripe hiccup shouldn't block deletion.
  if (org.stripe_subscription_id && stripeConfigured()) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id as string);
      // Only a LIVE sub needs canceling. If the cancel of a live sub fails, ABORT
      // the delete — otherwise we'd remove the org (and the only record of who to
      // bill) while Stripe keeps charging the customer forever.
      if (["active", "trialing", "past_due", "unpaid", "paused"].includes(sub.status)) {
        await stripe.subscriptions.cancel(org.stripe_subscription_id as string);
      }
    } catch (e: any) {
      // A 'no such subscription' / already-canceled error is safe to ignore;
      // anything else means we couldn't guarantee billing stopped → don't delete.
      const code = e?.code || e?.raw?.code;
      if (code !== "resource_missing") {
        return NextResponse.json({ error: `Couldn't cancel the company's subscription — deletion aborted so billing can't continue. Try again.` }, { status: 502 });
      }
    }
  } else if (org.stripe_customer_id && stripeConfigured()) {
    // The DB sub id is written only by the webhook, so it can lag a fresh
    // checkout. Cancel any live sub on the customer too, or a deletion during that
    // window would leave a billing subscription with no org record behind it.
    try {
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({ customer: org.stripe_customer_id as string, status: "all", limit: 10 });
      const live = subs.data.filter((s) => ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status));
      for (const s of live) await stripe.subscriptions.cancel(s.id);
    } catch (e: any) {
      const code = e?.code || e?.raw?.code;
      if (code !== "resource_missing") {
        return NextResponse.json({ error: `Couldn't cancel the company's subscription — deletion aborted so billing can't continue. Try again.` }, { status: 502 });
      }
    }
  }

  // Delete the org → cascades all org-scoped rows + memberships.
  const { error } = await db.from("organizations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // Delete the auth login for members who are now orphaned (no other company) —
  // so the email is freed up to sign up fresh. Never delete a super-admin login.
  let deletedUsers = 0;
  const failedUserDeletes: string[] = [];
  for (const m of roster) {
    // Resolve the AUTHORITATIVE auth email — memberships.email is a denormalized,
    // nullable copy that can be stale, and super-admin status is defined by the
    // real auth.users email. Trusting the stale copy could delete the platform
    // owner's login.
    let realEmail: string | null = (m.email as string) ?? null;
    try {
      const { data } = await db.auth.admin.getUserById(m.user_id as string);
      realEmail = data?.user?.email ?? realEmail;
    } catch { /* fall back to the denormalized value */ }
    if (isSuperAdminEmail(realEmail)) continue;     // never delete a super-admin login
    if (!realEmail) continue;                        // unknown identity → don't auto-delete
    const { count } = await db.from("memberships")
      .select("*", { count: "exact", head: true }).eq("user_id", m.user_id as string);
    if ((count || 0) > 0) continue; // still belongs to another company → keep login
    // Delete the auth user FIRST — profiles.id references auth.users(id) ON DELETE
    // CASCADE (0001), so the profile row goes with it. (Deleting the profile first
    // and then failing the auth delete would orphan a profile-less login.)
    const { error: delErr } = await db.auth.admin.deleteUser(m.user_id as string);
    if (!delErr) deletedUsers++;
    else failedUserDeletes.push((realEmail || m.user_id) as string);
  }

  return NextResponse.json({ ok: true, id, name: org.name, deletedUsers, failedUserDeletes });
}

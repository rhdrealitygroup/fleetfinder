// Referral program credit logic ("Give $50, get $50"). All writes go through the
// service role. Crediting uses Stripe customer-balance transactions (a negative
// amount = credit applied to future invoices), made idempotent with keys so a
// retried webhook can't double-credit.
import type Stripe from "stripe";
import { createServiceRoleClient } from "./supabase/server";

export const REFERRAL_CREDIT_CENTS = 5000; // $50

/* eslint-disable @typescript-eslint/no-explicit-any */

// Apply the referee's $50 welcome credit to their Stripe customer, once, when
// they subscribe. Guarded by referrals.referee_credited + an idempotency key.
export async function applyRefereeCredit(stripe: Stripe, refereeOrgId: string, customerId: string) {
  const db = createServiceRoleClient();
  const { data: r } = await db.from("referrals").select("id, referee_credited").eq("referee_org", refereeOrgId).maybeSingle();
  if (!r || r.referee_credited) return;
  try {
    await stripe.customers.createBalanceTransaction(
      customerId,
      { amount: -REFERRAL_CREDIT_CENTS, currency: "usd", description: "Referral welcome credit ($50 off)" },
      { idempotencyKey: `ref-referee-${r.id}` },
    );
    await db.from("referrals").update({ referee_credited: true }).eq("id", r.id);
  } catch { /* best-effort; flag stays false so a later attempt retries */ }
}

// The referee made a real (non-$0) payment → mark the reward earned and credit
// the referrer if they already have a Stripe customer.
export async function onRefereePaid(stripe: Stripe, refereeOrgId: string) {
  const db = createServiceRoleClient();
  const { data: r } = await db.from("referrals")
    .select("id, referrer_org, referrer_reward_earned, referrer_credited")
    .eq("referee_org", refereeOrgId).maybeSingle();
  if (!r || r.referrer_credited) return;
  if (!r.referrer_reward_earned) await db.from("referrals").update({ referrer_reward_earned: true }).eq("id", r.id);
  await creditReferrerIfPossible(stripe, r.referrer_org as string);
}

// Apply any earned-but-uncredited referrer rewards to the referrer's Stripe
// customer. Called on referee payment AND at the referrer's own checkout (when
// they first get a customer). No-op if the referrer has no customer yet.
export async function creditReferrerIfPossible(stripe: Stripe, referrerOrgId: string) {
  const db = createServiceRoleClient();
  const { data: rows } = await db.from("referrals")
    .select("id").eq("referrer_org", referrerOrgId).eq("referrer_reward_earned", true).eq("referrer_credited", false);
  if (!rows?.length) return;
  const { data: org } = await db.from("organizations").select("stripe_customer_id").eq("id", referrerOrgId).maybeSingle();
  const customerId = org?.stripe_customer_id as string | undefined;
  if (!customerId) return; // applied later, at the referrer's own checkout
  for (const row of rows as any[]) {
    try {
      await stripe.customers.createBalanceTransaction(
        customerId,
        { amount: -REFERRAL_CREDIT_CENTS, currency: "usd", description: "Referral reward credit ($50)" },
        { idempotencyKey: `ref-referrer-${row.id}` },
      );
      await db.from("referrals").update({ referrer_credited: true }).eq("id", row.id);
    } catch { /* best-effort; retried on next trigger */ }
  }
}

// Referral stats for a company's dashboard.
export async function referralStats(orgId: string) {
  const db = createServiceRoleClient();
  const { data } = await db.from("referrals")
    .select("referee_org, referrer_reward_earned, referrer_credited").eq("referrer_org", orgId);
  const invited = data?.length || 0;
  const joined = (data || []).filter((r: any) => r.referrer_reward_earned).length;
  const earnedDollars = (data || []).filter((r: any) => r.referrer_credited).length * (REFERRAL_CREDIT_CENTS / 100);
  // Rewards earned but not yet dropped as credit (e.g. the referrer had no Stripe
  // customer when their referee paid — applied at their next checkout).
  const pendingDollars = (data || []).filter((r: any) => r.referrer_reward_earned && !r.referrer_credited).length * (REFERRAL_CREDIT_CENTS / 100);
  return { invited, joined, earnedDollars, pendingDollars };
}

// Available account credit (in dollars) sitting on the org's Stripe customer —
// the real spendable balance, regardless of whether it came from a referral
// reward, a welcome credit, or a manual adjustment. Stripe stores this in cents
// with a NEGATIVE value meaning "credit the customer." 0 when no customer yet.
export async function referralCreditDollars(stripe: Stripe, orgId: string): Promise<number> {
  const db = createServiceRoleClient();
  const { data: org } = await db.from("organizations").select("stripe_customer_id").eq("id", orgId).maybeSingle();
  const cust = org?.stripe_customer_id as string | undefined;
  if (!cust) return 0;
  try {
    const c: any = await stripe.customers.retrieve(cust);
    if (c?.deleted) return 0;
    const bal = Number(c?.balance ?? 0);
    return bal < 0 ? Math.round((-bal) / 100 * 100) / 100 : 0;
  } catch { return 0; }
}

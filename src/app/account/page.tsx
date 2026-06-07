import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { referralStats } from "@/lib/referrals";
import { ReferralPanel } from "./referrals/ReferralPanel";
import { Building2, CreditCard, Users, Store } from "lucide-react";

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  trial: { t: "Free trial", c: "text-warning" },
  active: { t: "Active", c: "text-positive" },
  past_due: { t: "Past due", c: "text-destructive" },
  unpaid: { t: "Payment issue", c: "text-destructive" },
  paused: { t: "Paused", c: "text-muted-foreground" },
  canceled: { t: "Canceled", c: "text-muted-foreground" },
};
const labelFor = (s: string) => STATUS_LABEL[s] || { t: s ? s[0].toUpperCase() + s.slice(1) : "Inactive", c: "text-muted-foreground" };

export default async function AccountOverviewPage() {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/account");

  let membership = ctx.membership;
  if (!membership) {
    const created = await ensureOrgForUser();
    if (created) membership = { org_id: created.org_id, role: created.role as Role };
  }

  const db = createServiceRoleClient();
  const { data: org } = membership
    ? await db.from("organizations").select("name, plan_status, comped, trial_ends_at, current_period_end, cancel_at_period_end, agent_limit, monthly_price_override, referral_code").eq("id", membership.org_id).single()
    : { data: null };
  const { count: agentCount } = membership
    ? await db.from("memberships").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id)
    : { count: 0 };
  const refStats = membership ? await referralStats(membership.org_id) : { invited: 0, joined: 0, earnedDollars: 0 };

  const comped = !!org?.comped;
  const status = org?.plan_status || "trial";
  const label = labelFor(status);
  const trialEnds = org?.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  const baseMonthly = org?.monthly_price_override != null ? org.monthly_price_override : 100;
  const monthly = baseMonthly + Math.max(0, (org?.agent_limit || 1) - 1) * 15;

  let planLine: string;
  if (comped) planLine = "Complimentary access — no charge on this account.";
  else if (status === "trial") planLine = trialEnds ? `Your free trial runs through ${trialEnds}. No card on file — you won't be charged.` : "You're on the free trial.";
  else if (status === "active") planLine = org?.cancel_at_period_end ? "Active — set to cancel at the end of the period." : `Active — $${monthly}/mo.`;
  else if (status === "past_due" || status === "unpaid") planLine = "Payment problem — update your card in Billing to keep access.";
  else if (status === "paused") planLine = "Your subscription is paused.";
  else planLine = "Subscription canceled.";

  const agents = agentCount || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-1">Account</h1>
        <p className="text-sm text-muted-foreground">{org?.name || "Your company"}</p>
      </div>

      {/* Refer & earn — the boldest thing on the page */}
      {org?.referral_code && (
        <ReferralPanel code={org.referral_code as string} invited={refStats.invited} joined={refStats.joined} earned={refStats.earnedDollars} compact />
      )}

      {/* Plan & trial status */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4 text-muted-foreground" /> Plan</h2>
          <span className={`text-sm font-medium ${comped ? "text-primary" : label.c}`}>{comped ? "Complimentary" : label.t}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{planLine}</p>
        <Link href="/account/billing" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition">
          {status === "trial" && !comped ? "Manage plan & subscribe" : "Manage billing"}
        </Link>
      </div>

      {/* Company + profile */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><Building2 className="w-4 h-4 text-muted-foreground" /> Company &amp; profile</h2>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Company</dt>
            <dd className="mt-0.5">{org?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Signed in as</dt>
            <dd className="mt-0.5 truncate">{ctx.user.email}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-2 mt-5">
          <Link href="/account/company" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-white/5 transition">Edit company</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-white/5 transition">Sign out</button>
          </form>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/account/team" className="rounded-xl border border-border bg-card p-5 hover:bg-white/5 transition">
          <div className="flex items-center gap-2 font-medium mb-1"><Users className="w-4 h-4 text-muted-foreground" /> Agents</div>
          <p className="text-sm text-muted-foreground">{agents} on your team · invite or remove</p>
        </Link>
        <Link href="/account/dealers" className="rounded-xl border border-border bg-card p-5 hover:bg-white/5 transition">
          <div className="flex items-center gap-2 font-medium mb-1"><Store className="w-4 h-4 text-muted-foreground" /> Dealers</div>
          <p className="text-sm text-muted-foreground">Pick the dealers your searches scope to</p>
        </Link>
      </div>
    </div>
  );
}

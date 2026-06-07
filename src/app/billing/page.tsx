import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { stripeConfigured } from "@/lib/stripe";
import { BillingActions } from "./BillingActions";

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  trial: { t: "Free trial", c: "text-warning" },
  active: { t: "Active", c: "text-positive" },
  past_due: { t: "Past due", c: "text-destructive" },
  canceled: { t: "Canceled", c: "text-muted-foreground" },
};

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/billing");

  // Auto-provision the org if this account never got one (e.g. signed up with
  // email auto-confirm, which skips the onboarding step). Idempotent.
  let membership = ctx.membership;
  if (!membership) {
    const created = await ensureOrgForUser();
    if (created) membership = { org_id: created.org_id, role: created.role as Role };
  }

  const supabase = await createClient();
  const { data: org } = membership
    ? await supabase.from("organizations").select("*").eq("id", membership.org_id).single()
    : { data: null };

  const { count: agentCount } = membership
    ? await supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", membership.org_id)
    : { count: 0 };

  const status = org?.plan_status || "trial";
  const label = STATUS_LABEL[status] || STATUS_LABEL.trial;
  const hasSub = !!org?.stripe_subscription_id;
  const trialEnds = org?.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  const periodEnds = org?.current_period_end ? new Date(org.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  // A subscription that's in its trial window (started checkout, not yet charged).
  const subTrialing = hasSub && status === "trial";
  const cancelScheduled = !!org?.cancel_at_period_end;
  const isOwner = membership?.role === "owner";
  const comped = !!org?.comped;
  const baseMonthly = org?.monthly_price_override != null ? org.monthly_price_override : 100;
  const monthly = baseMonthly + Math.max(0, (org?.agent_limit || 1) - 1) * 15;
  const customPrice = org?.monthly_price_override != null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-3xl mx-auto p-5">
        <h1 className="font-heading text-2xl font-bold mb-1">Billing</h1>
        <p className="text-sm text-muted-foreground mb-8">{org?.name || "Your company"}</p>

        {!org && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No organization yet. Visit <a href="/onboarding" className="text-primary hover:underline">onboarding</a> to set one up.
          </div>
        )}

        {org && (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              <Stat label="Plan status" value={comped ? "Complimentary" : label.t} valueClass={comped ? "text-primary" : label.c} />
              <Stat label="Agents" value={`${agentCount || 1} / ${org.agent_limit}`} />
              <Stat label={comped ? "Monthly" : status === "trial" ? "Trial ends" : "Monthly"} value={comped ? "Free" : status === "trial" && trialEnds ? trialEnds : `$${monthly}`} />
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-1">{hasSub ? "Manage your subscription" : "Activate your subscription"}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {comped
                  ? "Complimentary access — no charge on this account."
                  : customPrice
                    ? `Custom plan: $${baseMonthly}/mo per company + $15/mo per additional agent. Cancel anytime.`
                    : "$100/mo per company + $15/mo per additional agent. Cancel anytime."}
              </p>

              {!stripeConfigured() ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 text-sm p-3 text-warning-foreground">
                  Billing isn&apos;t connected yet — add Stripe keys to enable checkout. (Search &amp; calculator work without it.)
                </div>
              ) : !isOwner ? (
                <p className="text-sm text-muted-foreground">Only the company owner can manage billing.</p>
              ) : comped ? (
                <p className="text-sm text-muted-foreground">Complimentary access — there&apos;s nothing to pay. Reach out if anything changes.</p>
              ) : (
                <BillingActions
                  hasSubscription={hasSub}
                  baseMonthly={baseMonthly}
                  defaultSeats={Math.max(0, (agentCount || 1) - 1)}
                  cancelAtPeriodEnd={cancelScheduled}
                  trialing={subTrialing}
                  endLabel={subTrialing ? (trialEnds || "") : (periodEnds || "")}
                />
              )}
            </div>
          </>
        )}

        <div className="rounded-xl border border-border bg-card p-6 mt-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold mb-1">Account</h2>
            <p className="text-sm text-muted-foreground truncate">
              Signed in as <span className="text-foreground">{ctx.user.email}</span>
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-white/5 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${valueClass || ""}`}>{value}</div>
    </div>
  );
}

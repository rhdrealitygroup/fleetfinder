import { redirect } from "next/navigation";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { stripeConfigured, seatPriceId } from "@/lib/stripe";
import { BillingActions } from "@/app/billing/BillingActions";

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  trial: { t: "Free trial", c: "text-warning" },
  active: { t: "Active", c: "text-positive" },
  past_due: { t: "Past due", c: "text-destructive" },
  unpaid: { t: "Payment issue", c: "text-destructive" },
  paused: { t: "Paused", c: "text-muted-foreground" },
  canceled: { t: "Canceled", c: "text-muted-foreground" },
};
// Neutral fallback for any unmapped status — never default to the reassuring
// "Free trial" label (which would hide an actual billing problem).
const labelFor = (s: string) => STATUS_LABEL[s] || { t: s ? s[0].toUpperCase() + s.slice(1) : "Inactive", c: "text-muted-foreground" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/account/billing");
  const checkout = (await searchParams)?.checkout;

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
  const label = labelFor(status);
  const hasSub = !!org?.stripe_subscription_id;
  const trialEnds = org?.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  const periodEnds = org?.current_period_end ? new Date(org.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  const subTrialing = hasSub && status === "trial";
  const cancelScheduled = !!org?.cancel_at_period_end;
  // Will a NEW checkout actually get a free trial? Mirrors checkout/route.ts: only
  // if the org never used a trial AND its app trial window hasn't passed. A
  // resubscribe-after-cancel or expired trial gets charged immediately, so the UI
  // must not promise "pay nothing during your trial".
  // eslint-disable-next-line react-hooks/purity -- Server Component: executes once on the server, never re-renders
  const now = Date.now();
  const trialAvailable = !org?.trial_used && (!org?.trial_ends_at || Date.parse(org.trial_ends_at as string) > now + 60_000);
  const isOwner = membership?.role === "owner";
  const comped = !!org?.comped;
  const baseMonthly = org?.monthly_price_override != null ? org.monthly_price_override : 100;
  const monthly = baseMonthly + Math.max(0, (org?.agent_limit || 1) - 1) * 15;
  const customPrice = org?.monthly_price_override != null;

  return (
    <div className="space-y-6">
      {checkout === "success" && (
        <div className="rounded-lg border border-positive/40 bg-positive/10 p-3 text-sm text-positive">
          🎉 You&apos;re subscribed — thanks! Your plan is active below.
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          Checkout cancelled — no charge was made. You can subscribe whenever you&apos;re ready.
        </div>
      )}
      <div>
        <h1 className="font-heading text-2xl font-bold mb-1">Billing</h1>
        <p className="text-sm text-muted-foreground">{org?.name || "Your company"}</p>
      </div>

      {!org && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No organization yet. Visit <a href="/onboarding" className="text-primary hover:underline">onboarding</a> to set one up.
        </div>
      )}

      {org && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
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
                Billing isn&apos;t connected yet — add Stripe keys to enable checkout. (Search works without it.)
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
                currentBilledSeats={Math.max(0, (org?.agent_limit || 1) - 1)}
                seatPriceConfigured={!!seatPriceId()}
                cancelAtPeriodEnd={cancelScheduled}
                trialing={subTrialing}
                endLabel={subTrialing ? (trialEnds || "") : (periodEnds || "")}
                trialAvailable={trialAvailable}
              />
            )}
          </div>
        </>
      )}
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

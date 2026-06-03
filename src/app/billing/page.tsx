import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionContext } from "@/lib/auth";
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
  const { user, membership } = await getSessionContext();
  if (!user) redirect("/login?next=/billing");

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
  const isOwner = membership?.role === "owner";

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
              <Stat label="Plan status" value={label.t} valueClass={label.c} />
              <Stat label="Agents" value={`${agentCount || 1} / ${org.agent_limit}`} />
              <Stat label={status === "trial" ? "Trial ends" : "Monthly"} value={status === "trial" && trialEnds ? trialEnds : `$${100 + Math.max(0, (org.agent_limit - 1)) * 15}`} />
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-1">{hasSub ? "Manage your subscription" : "Activate your subscription"}</h2>
              <p className="text-sm text-muted-foreground mb-4">$100/mo per company + $15/mo per additional agent. Cancel anytime.</p>

              {!stripeConfigured() ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 text-sm p-3 text-warning-foreground">
                  Billing isn&apos;t connected yet — add Stripe keys to enable checkout. (Search &amp; calculator work without it.)
                </div>
              ) : !isOwner ? (
                <p className="text-sm text-muted-foreground">Only the company owner can manage billing.</p>
              ) : (
                <BillingActions hasSubscription={hasSub} />
              )}
            </div>
          </>
        )}
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

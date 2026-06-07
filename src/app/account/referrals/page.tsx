import { redirect } from "next/navigation";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { referralStats } from "@/lib/referrals";
import { ReferralPanel } from "./ReferralPanel";

export default async function ReferralsPage() {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/account/referrals");

  let membership = ctx.membership;
  if (!membership) {
    const created = await ensureOrgForUser();
    if (created) membership = { org_id: created.org_id, role: created.role as Role };
  }

  const db = createServiceRoleClient();
  const { data: org } = membership
    ? await db.from("organizations").select("referral_code").eq("id", membership.org_id).single()
    : { data: null };
  const stats = membership ? await referralStats(membership.org_id) : { invited: 0, joined: 0, earnedDollars: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-1">Refer &amp; earn</h1>
        <p className="text-sm text-muted-foreground">Know other brokers? Invite them — you both come out ahead.</p>
      </div>

      {org?.referral_code
        ? <ReferralPanel code={org.referral_code as string} invited={stats.invited} joined={stats.joined} earned={stats.earnedDollars} />
        : <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Your referral link will appear here once your company is set up.</div>}

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">How it works</h2>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li><span className="text-foreground font-medium">1. Share your link.</span> Copy it, email it, or text it to another broker.</li>
          <li><span className="text-foreground font-medium">2. They sign up &amp; subscribe.</span> They get $50 off their first month.</li>
          <li><span className="text-foreground font-medium">3. You get $50.</span> Credit lands on your account the moment their first payment clears.</li>
        </ol>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/team");

  // Auto-provision the org for accounts that never went through onboarding.
  let membership = ctx.membership;
  if (!membership) {
    const created = await ensureOrgForUser();
    if (created) membership = { org_id: created.org_id, role: created.role as Role };
  }

  const supabase = await createClient();
  const { data: members } = membership
    ? await supabase.from("memberships").select("id, role, first_name, last_name, email, created_at").eq("org_id", membership.org_id).order("created_at")
    : { data: [] };
  const { data: org } = membership
    ? await supabase.from("organizations").select("name, agent_limit").eq("id", membership.org_id).single()
    : { data: null };

  const canManage = membership?.role === "owner" || membership?.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-3xl mx-auto p-5">
        <h1 className="font-heading text-2xl font-bold mb-1">Team</h1>
        <p className="text-sm text-muted-foreground mb-8">{org?.name || "Your company"} · {members?.length || 0} of {org?.agent_limit || 1} seats used</p>
        {!membership ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Set up your organization in <a href="/onboarding" className="text-primary hover:underline">onboarding</a> first.
          </div>
        ) : (
          <TeamManager
            initialMembers={(members || []) as never}
            canManage={canManage}
            agentLimit={org?.agent_limit || 1}
          />
        )}
      </main>
    </div>
  );
}

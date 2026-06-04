import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ShieldAlert } from "lucide-react";

// Super-admin platform console (RHD only). Lists every organization with its
// plan + agent count, and every user. Uses the service role to bypass RLS.
export default async function AdminPage() {
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) redirect("/login?next=/admin");

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppNav />
        <main className="max-w-md mx-auto p-5 pt-24 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-4 text-destructive" />
          <h1 className="font-heading text-xl font-bold mb-1">Restricted</h1>
          <p className="text-sm text-muted-foreground">This area is for LotCompas platform admins only.</p>
        </main>
      </div>
    );
  }

  const db = createServiceRoleClient();
  const { data: orgs } = await db.from("organizations").select("id, name, plan_status, agent_limit, trial_ends_at, created_at").order("created_at", { ascending: false });
  const { data: members } = await db.from("memberships").select("org_id, role, email");

  const countByOrg = new Map<string, number>();
  for (const m of members || []) countByOrg.set(m.org_id, (countByOrg.get(m.org_id) || 0) + 1);

  const totalOrgs = orgs?.length || 0;
  const totalUsers = members?.length || 0;
  const activeOrgs = (orgs || []).filter((o) => o.plan_status === "active").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto p-5">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-heading text-2xl font-bold">Platform console</h1>
          <span className="text-[10px] uppercase tracking-widest text-primary border border-primary/40 rounded-full px-2 py-0.5">Super admin</span>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Signed in as {user.email}</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <Stat label="Companies" value={String(totalOrgs)} />
          <Stat label="Active subscriptions" value={String(activeOrgs)} />
          <Stat label="Total users" value={String(totalUsers)} />
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Organizations</div>
          {totalOrgs === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No organizations yet. They appear here as companies sign up.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                  <th className="px-4 py-2 font-medium">Agents</th>
                  <th className="px-4 py-2 font-medium">Seat limit</th>
                </tr>
              </thead>
              <tbody>
                {(orgs || []).map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{o.name}</td>
                    <td className="px-4 py-2.5"><PlanBadge status={o.plan_status} /></td>
                    <td className="px-4 py-2.5 tnum">{countByOrg.get(o.id) || 0}</td>
                    <td className="px-4 py-2.5 tnum">{o.agent_limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">Editing controls (change plan, adjust seat limits, suspend) wire in next — this is the read view.</p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-2xl font-semibold mt-1 tnum">{value}</div></div>;
}

function PlanBadge({ status }: { status: string }) {
  const map: Record<string, string> = { active: "text-positive", trial: "text-warning", past_due: "text-destructive", canceled: "text-muted-foreground" };
  return <span className={`text-xs font-medium ${map[status] || "text-muted-foreground"}`}>{status}</span>;
}

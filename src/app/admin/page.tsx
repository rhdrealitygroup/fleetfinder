import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ShieldAlert } from "lucide-react";
import { CompaniesTable, type Member } from "./CompaniesTable";
import { PromosManager } from "./PromosManager";
import { CAR_CATALOG } from "@/lib/carCatalog";

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
          <p className="text-sm text-muted-foreground">This area is for LotCompass platform admins only.</p>
        </main>
      </div>
    );
  }

  const db = createServiceRoleClient();
  const { data: orgs } = await db.from("organizations").select("id, name, plan_status, agent_limit, trial_ends_at, created_at, comped, monthly_price_override").order("created_at", { ascending: false });
  const { data: members } = await db.from("memberships").select("org_id, role, email");

  const membersByOrg: Record<string, Member[]> = {};
  for (const m of members || []) {
    (membersByOrg[m.org_id] ||= []).push({ email: m.email, role: m.role });
  }

  const totalOrgs = orgs?.length || 0;
  const totalUsers = members?.length || 0;
  const activeOrgs = (orgs || []).filter((o) => o.plan_status === "active").length;

  // Catalog drift watchdog (written by /api/cron/catalog-health).
  const { data: health } = await db
    .from("catalog_health")
    .select("make, model, status, last_checked")
    .order("last_checked", { ascending: false });
  const hRows = health || [];
  const totalCatalog = Object.values(CAR_CATALOG).reduce((n, ms) => n + (ms as string[]).length, 0);
  const hOk = hRows.filter((r) => r.status === "ok").length;
  const hEmpty = hRows.filter((r) => r.status === "empty").length;
  const hRegressed = hRows.filter((r) => r.status === "regressed");
  const lastSweep = hRows[0]?.last_checked ? new Date(hRows[0].last_checked as string) : null;

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

        <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Companies &amp; people</div>
          <CompaniesTable orgs={orgs || []} membersByOrg={membersByOrg} />
        </div>

        {/* Catalog drift watchdog */}
        <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold">Catalog health</span>
            <span className="text-[11px] text-muted-foreground">
              {lastSweep ? `Last checked ${lastSweep.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "No sweep yet"}
            </span>
          </div>
          <div className="p-4 space-y-4">
            {hRegressed.length > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div className="font-semibold mb-1">⚠️ {hRegressed.length} model{hRegressed.length === 1 ? "" : "s"} lost spec data since the last check</div>
                <div className="text-[13px] text-foreground">{hRegressed.map((r) => `${r.make} ${r.model}`).join(", ")}</div>
                <div className="text-[12px] text-muted-foreground mt-1">Usually a model rename in MarketCheck or a feed break — fix via MODEL_ALIASES in marketcheck.ts.</div>
              </div>
            ) : hRows.length > 0 ? (
              <div className="rounded-lg border border-positive/30 bg-positive/10 p-3 text-sm text-positive">✓ Every checked model has live trim &amp; color data.</div>
            ) : (
              <div className="text-sm text-muted-foreground">Baseline still building — the daily sweep covers the whole catalog over about a week.</div>
            )}
            <div className="grid grid-cols-4 gap-3">
              <MiniStat label="Models OK" value={String(hOk)} />
              <MiniStat label="Empty (not US-sold)" value={String(hEmpty)} />
              <MiniStat label="Regressed" value={String(hRegressed.length)} alert={hRegressed.length > 0} />
              <MiniStat label="Coverage" value={`${hRows.length}/${totalCatalog}`} />
            </div>
          </div>
        </div>

        <PromosManager />

        <p className="text-xs text-muted-foreground mt-4">Click a company to see its people and seat usage. Promo codes are redeemable at checkout.</p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-2xl font-semibold mt-1 tnum">{value}</div></div>;
}

function MiniStat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className={`text-lg font-bold tnum ${alert ? "text-destructive" : "text-foreground"}`}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

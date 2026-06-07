"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Users, Gift, DollarSign } from "lucide-react";

export type Org = {
  id: string; name: string; plan_status: string; agent_limit: number;
  trial_ends_at: string | null; created_at: string; comped?: boolean;
  monthly_price_override?: number | null;
};
export type Member = { email: string | null; role: string };

const PLAN: Record<string, string> = {
  active: "text-positive", trial: "text-warning",
  past_due: "text-destructive", canceled: "text-muted-foreground",
};

// Platform-wide company list. Click a company to expand its people + seat usage.
export function CompaniesTable({ orgs, membersByOrg }: { orgs: Org[]; membersByOrg: Record<string, Member[]> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [comped, setComped] = useState<Record<string, boolean>>(() => Object.fromEntries(orgs.map((o) => [o.id, !!o.comped])));

  const [price, setPrice] = useState<Record<string, string>>(() =>
    Object.fromEntries(orgs.map((o) => [o.id, o.monthly_price_override != null ? String(o.monthly_price_override) : ""])));
  const [savingPrice, setSavingPrice] = useState<string | null>(null);
  const [priceMsg, setPriceMsg] = useState<Record<string, string>>({});

  // Grant/revoke complimentary free access (bypasses Stripe; normal app, no admin).
  async function toggleComp(id: string) {
    const next = !comped[id];
    setComped((c) => ({ ...c, [id]: next }));
    try {
      const r = await fetch("/api/admin/companies", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, comped: next }),
      });
      if (!r.ok) setComped((c) => ({ ...c, [id]: !next })); // revert on failure
    } catch { setComped((c) => ({ ...c, [id]: !next })); }
  }

  // Set a custom monthly price for an org (blank = standard pricing).
  async function savePrice(id: string) {
    setSavingPrice(id);
    setPriceMsg((m) => ({ ...m, [id]: "" }));
    const raw = (price[id] ?? "").trim();
    try {
      const r = await fetch("/api/admin/companies", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, monthlyPriceOverride: raw === "" ? null : Number(raw) }),
      });
      const d = await r.json().catch(() => ({}));
      setPriceMsg((m) => ({ ...m, [id]: !r.ok ? (d.error || "Save failed") : d.warning ? d.warning : "Saved ✓" }));
    } catch {
      setPriceMsg((m) => ({ ...m, [id]: "Save failed — try again" }));
    } finally { setSavingPrice(null); }
  }

  if (!orgs.length) {
    return <div className="p-6 text-sm text-muted-foreground">No companies yet. They appear here as accounts sign up.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-2 font-medium">Company</th>
          <th className="px-4 py-2 font-medium">Plan</th>
          <th className="px-4 py-2 font-medium">Seats used</th>
          <th className="px-4 py-2 font-medium">Seat limit</th>
        </tr>
      </thead>
      <tbody>
        {orgs.map((o) => {
          const people = membersByOrg[o.id] || [];
          const isOpen = open === o.id;
          return (
            <Fragment key={o.id}>
              <tr className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-white/5"
                onClick={() => setOpen(isOpen ? null : o.id)}>
                <td className="px-4 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    {o.name}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {comped[o.id]
                    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Gift className="w-3 h-3" /> Free access</span>
                    : <span className={`text-xs font-medium ${PLAN[o.plan_status] || "text-muted-foreground"}`}>{o.plan_status}</span>}
                </td>
                <td className="px-4 py-2.5 tnum">{people.length}</td>
                <td className="px-4 py-2.5 tnum">{o.agent_limit}</td>
              </tr>
              {isOpen && (
                <tr className="bg-white/[0.03]">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> People ({people.length})
                    </div>
                    {people.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No members on this company.</p>
                    ) : (
                      <ul className="space-y-1">
                        {people.map((m, i) => (
                          <li key={i} className="flex items-center justify-between text-sm">
                            <span>{m.email || <span className="text-muted-foreground italic">no email</span>}</span>
                            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${m.role === "owner" ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>{m.role}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {o.trial_ends_at && o.plan_status === "trial" && !comped[o.id] && (
                      <p className="text-[11px] text-muted-foreground mt-2">Trial ends {new Date(o.trial_ends_at).toLocaleDateString()}</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" /> Complimentary access — full app, no Stripe payment
                      </span>
                      <button onClick={() => toggleComp(o.id)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-md border transition ${comped[o.id] ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {comped[o.id] ? "Revoke free access" : "Grant free access"}
                      </button>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Custom monthly price (blank = standard $100 + seats)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">$</span>
                        <input value={price[o.id] ?? ""} onChange={(e) => setPrice((p) => ({ ...p, [o.id]: e.target.value.replace(/[^0-9]/g, "") }))}
                          placeholder="std" inputMode="numeric"
                          className="w-20 rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50" />
                        <span className="text-xs text-muted-foreground">/mo</span>
                        <button onClick={() => savePrice(o.id)} disabled={savingPrice === o.id}
                          className="text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                          {savingPrice === o.id ? "Saving…" : "Save"}
                        </button>
                        {priceMsg[o.id] && <span className={`text-[11px] ${priceMsg[o.id].startsWith("Saved") ? "text-positive" : "text-destructive"}`}>{priceMsg[o.id]}</span>}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Users, Gift, DollarSign, Trash2 } from "lucide-react";

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
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null); // org armed for delete
  const [compSaving, setCompSaving] = useState<string | null>(null); // org with an in-flight comp toggle
  const [compMsg, setCompMsg] = useState<Record<string, string>>({});
  const router = useRouter();

  // Grant/revoke complimentary free access (bypasses Stripe; normal app, no admin).
  async function toggleComp(id: string) {
    if (compSaving === id) return; // ignore double-clicks → no conflicting PATCHes
    const next = !comped[id];
    setCompSaving(id);
    setCompMsg((m) => ({ ...m, [id]: "" }));
    setComped((c) => ({ ...c, [id]: next }));
    try {
      const r = await fetch("/api/admin/companies", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, comped: next }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setComped((c) => ({ ...c, [id]: !next })); // revert
        setCompMsg((m) => ({ ...m, [id]: d.error || "Couldn't update free access — try again." }));
      } else {
        router.refresh(); // keep the stat cards / status in sync
      }
    } catch {
      setComped((c) => ({ ...c, [id]: !next }));
      setCompMsg((m) => ({ ...m, [id]: "Couldn't update free access — try again." }));
    }
    finally { setCompSaving(null); }
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

  // Permanently delete a company (and orphaned member logins). Uses an in-UI
  // two-step confirm (arm → confirm) rather than window.confirm(), which some
  // browsers silently suppress (returning false) so the click did nothing.
  async function deleteCompany(id: string) {
    setConfirmId(null);
    setDeleting(id);
    setDeleteErr((m) => ({ ...m, [id]: "" }));
    try {
      const r = await fetch("/api/admin/companies", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDeleteErr((m) => ({ ...m, [id]: d.error || "Delete failed" })); return; }
      setRemoved((s) => new Set(s).add(id));
      if (open === id) setOpen(null);
      router.refresh(); // re-run the Server Component so the summary stat cards update
    } catch {
      setDeleteErr((m) => ({ ...m, [id]: "Delete failed — try again" }));
    } finally { setDeleting(null); }
  }

  const visibleOrgs = orgs.filter((o) => !removed.has(o.id));
  if (!visibleOrgs.length) {
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
        {visibleOrgs.map((o) => {
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
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" /> Complimentary access — full app, no Stripe payment
                      </span>
                      <div className="flex items-center gap-2">
                        {compMsg[o.id] && <span className="text-[11px] text-destructive">{compMsg[o.id]}</span>}
                        <button onClick={() => toggleComp(o.id)} disabled={compSaving === o.id}
                          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition disabled:opacity-50 ${comped[o.id] ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                          {compSaving === o.id ? "Saving…" : comped[o.id] ? "Revoke free access" : "Grant free access"}
                        </button>
                      </div>
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
                    <div className="mt-3 pt-3 border-t border-destructive/30 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        {confirmId === o.id
                          ? `Delete "${o.name}" and its ${people.length} account${people.length === 1 ? "" : "s"}? This can't be undone.`
                          : "Permanently delete this company & its member accounts"}
                      </span>
                      <div className="flex items-center gap-2">
                        {deleteErr[o.id] && <span className="text-[11px] text-destructive">{deleteErr[o.id]}</span>}
                        {confirmId === o.id ? (
                          <>
                            <button onClick={() => setConfirmId(null)} disabled={deleting === o.id}
                              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
                              Cancel
                            </button>
                            <button onClick={() => deleteCompany(o.id)} disabled={deleting === o.id}
                              className="text-xs font-semibold px-2.5 py-1 rounded-md border border-destructive bg-destructive text-white hover:bg-destructive/90 transition disabled:opacity-50">
                              {deleting === o.id ? "Deleting…" : "Yes, delete"}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => { setDeleteErr((m) => ({ ...m, [o.id]: "" })); setConfirmId(o.id); }} disabled={deleting === o.id}
                            className="text-xs font-medium px-2.5 py-1 rounded-md border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 transition disabled:opacity-50">
                            Delete company
                          </button>
                        )}
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

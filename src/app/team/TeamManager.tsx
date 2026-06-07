"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Trash2, ShieldCheck } from "lucide-react";

type Member = { id: string; role: string; first_name: string | null; last_name: string | null; email: string | null };

export function TeamManager({ initialMembers, canManage, agentLimit, unlimitedSeats = false, trialing = false }: { initialMembers: Member[]; canManage: boolean; agentLimit: number; unlimitedSeats?: boolean; trialing?: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // router.refresh() re-renders the server component but does NOT reset this
  // useState, so sync from the fresh prop — otherwise a newly invited agent
  // never shows up and a failed-then-refreshed removal wouldn't reconcile.
  useEffect(() => { setMembers(initialMembers); }, [initialMembers]);

  // Trial/comped orgs have no seat cap — never show the "at your limit" gate.
  const overLimit = !unlimitedSeats && members.length >= agentLimit;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't add agent");
      setEmail("");
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  async function remove(id: string) {
    setError("");
    const prev = members;
    setMembers((m) => m.filter((x) => x.id !== id)); // optimistic
    try {
      const r = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membership_id: id }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || "Couldn't remove that member."); setMembers(prev); return; }
      router.refresh(); // reconcile from the server on success
    } catch { setError("Couldn't remove that member."); setMembers(prev); } // explicit rollback — refresh() can't restore useState
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-sm font-semibold text-primary">
                {(m.first_name?.[0] || m.email?.[0] || "?").toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                  {m.role === "owner" && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary"><ShieldCheck className="w-3 h-3" /> Owner</span>}
                  {m.role === "admin" && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Admin</span>}
                </div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
            </div>
            {canManage && m.role !== "owner" && (
              <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive transition" title="Remove"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={add} className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold mb-1 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add an agent</div>
          <p className="text-xs text-muted-foreground mb-3">They&apos;ll get an email invite. Each agent beyond the first is $15/mo.</p>
          {trialing && <div className="text-xs text-muted-foreground mb-3">Add as many agents as you like during your free trial — they&apos;re only billed ($15/mo each) when you start a subscription.</div>}
          {overLimit && <div className="text-xs text-warning mb-3">You&apos;re at your seat limit ({agentLimit}). Adding another will require an extra seat on your plan — manage it in Billing.</div>}
          <div className="flex gap-2">
            <input type="email" required placeholder="agent@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" />
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Invite
            </button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </form>
      )}
    </div>
  );
}

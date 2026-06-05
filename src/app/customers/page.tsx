"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { Users, Plus, Trash2, Search, Phone, Mail, Clock } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Needs = { make?: string; model?: string; zip?: string; max_monthly?: string; color?: string; notes?: string };
type Customer = { id: string; name: string; phone?: string; email?: string; notes?: string; needs?: Needs; expires_at?: string; created_at?: string };

const empty = { name: "", phone: "", email: "", notes: "", make: "", model: "", zip: "", max_monthly: "", color: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/customers");
      const d = await r.json();
      setCustomers(Array.isArray(d.customers) ? d.customers : []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError("");
    const needs: Needs = { make: form.make, model: form.model, zip: form.zip, max_monthly: form.max_monthly, color: form.color, notes: form.notes };
    let ok = false;
    try {
      const r = await fetch("/api/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email, notes: form.notes, needs }),
      });
      ok = r.ok;
    } catch { ok = false; }
    setSaving(false);
    if (!ok) { setSaveError("Couldn't save — please try again."); return; } // keep form open, don't lose input
    setForm({ ...empty });
    setOpen(false);
    reload();
  }

  async function del(id: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    try {
      const r = await fetch("/api/customers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) reload(); // failed delete → resync so the row reappears
    } catch { reload(); }
  }

  function searchHref(c: Customer) {
    const n = c.needs || {};
    const p = new URLSearchParams();
    if (n.make) p.set("make", n.make);
    if (n.model) p.set("model", n.model);
    if (n.zip) p.set("zip", n.zip);
    if (n.max_monthly) p.set("max", n.max_monthly);
    if (n.color) p.set("color", n.color);
    return `/search?${p.toString()}`;
  }

  const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-4xl mx-auto p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold">Customers</h1>
            <p className="text-sm text-muted-foreground">{customers.length} saved · what each one is shopping for</p>
          </div>
          <button onClick={() => setOpen((v) => !v)} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add customer
          </button>
        </div>

        {open && (
          <div className="rounded-xl border border-border bg-card p-4 mb-6 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
              <input className={inputCls} placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              <input className={inputCls} placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium pt-1">Looking for</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <input className={inputCls} placeholder="Make (e.g. BMW)" value={form.make} onChange={(e) => set("make", e.target.value)} />
              <input className={inputCls} placeholder="Model (e.g. 3 Series)" value={form.model} onChange={(e) => set("model", e.target.value)} />
              <input className={inputCls} placeholder="Color" value={form.color} onChange={(e) => set("color", e.target.value)} />
              <input className={inputCls} placeholder="Customer ZIP" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
              <input className={inputCls} placeholder="Max $/mo" value={form.max_monthly} onChange={(e) => set("max_monthly", e.target.value)} />
            </div>
            <textarea className={inputCls} rows={2} placeholder="Notes (trade-in, timeline, must-haves…)" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setOpen(false); setForm({ ...empty }); setSaveError(""); }} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save customer"}</button>
            </div>
          </div>
        )}

        {customers.length === 0 && !open && (
          <div className="text-center py-24 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">No customers yet</p>
            <p className="text-sm">Add a customer and what they want — then jump straight to a search for them.</p>
          </div>
        )}

        <div className="space-y-2.5">
          {customers.map((c) => {
            const n = c.needs || {};
            const wants = [n.make, n.model, n.color, n.max_monthly ? `≤$${n.max_monthly}/mo` : "", n.zip ? `near ${n.zip}` : ""].filter(Boolean).join(" · ");
            return (
              <div key={c.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{c.name}</span>
                    {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</a>}
                  </div>
                  {wants && <div className="text-sm text-primary mt-0.5">{wants}</div>}
                  {c.notes && <div className="text-xs text-muted-foreground truncate mt-0.5">{c.notes}</div>}
                </div>
                {(n.make || n.model || n.zip) && (
                  <Link href={searchHref(c)} className="shrink-0 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium flex items-center gap-1.5 hover:bg-primary/20 transition">
                    <Search className="w-4 h-4" /> Search
                  </Link>
                )}
                <button onClick={() => del(c.id)} className="shrink-0 text-muted-foreground hover:text-destructive transition" title="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>

        {customers.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1"><Clock className="w-3 h-3" /> Saved to your account. Customer needs persist so you can re-run their search anytime.</p>
        )}
      </main>
    </div>
  );
}

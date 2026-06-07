"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag, Plus, Loader2, Check, X } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Promo = {
  id: string; code: string; active: boolean;
  percent_off: number | null; amount_off: number | null;
  duration: string | null; duration_in_months: number | null;
  times_redeemed: number; max_redemptions: number | null;
  expires_at: number | null; created: number;
};

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

function discountLabel(p: Promo) {
  const amt = p.percent_off != null ? `${p.percent_off}% off` : p.amount_off != null ? `$${p.amount_off} off` : "—";
  const dur = p.duration === "forever" ? "forever" : p.duration === "repeating" ? `for ${p.duration_in_months} mo` : "once";
  return `${amt} · ${dur}`;
}

// Super-admin promo/discount manager. Creates Stripe coupon + promotion code;
// customers redeem the code at checkout (allow_promotion_codes is already on).
export function PromosManager() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", kind: "percent", value: "", duration: "once", durationMonths: "3", maxRedemptions: "", expiresInDays: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/promos");
      const d = await r.json();
      if (!r.ok) setErr(d.error || "Failed to load promos");
      setPromos(Array.isArray(d.promos) ? d.promos : []);
    } catch { setErr("Failed to load promos"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr("");
    if (!form.value || Number(form.value) <= 0) { setErr("Enter a discount value."); return; }
    setCreating(true);
    try {
      const r = await fetch("/api/admin/promos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code, kind: form.kind, value: Number(form.value),
          duration: form.duration, durationMonths: Number(form.durationMonths),
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
          expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Failed to create promo"); return; }
      setForm({ code: "", kind: "percent", value: "", duration: "once", durationMonths: "3", maxRedemptions: "", expiresInDays: "" });
      if (d.promo) setPromos((prev) => [d.promo, ...prev]);
    } catch { setErr("Failed to create promo"); }
    finally { setCreating(false); }
  }

  async function toggle(p: Promo) {
    setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    try {
      const r = await fetch("/api/admin/promos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, active: !p.active }),
      });
      if (!r.ok) load();
    } catch { load(); }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
        <Tag className="w-4 h-4 text-primary" /> Promo codes &amp; discounts
      </div>

      {/* Create */}
      <div className="p-4 border-b border-border grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Code (optional)</label>
          <input className={inputCls} placeholder="LAUNCH20" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Discount type</label>
          <select className={inputCls} value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="percent">% off</option>
            <option value="amount">$ off</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{form.kind === "percent" ? "Percent (1-100)" : "Dollars off"}</label>
          <input className={inputCls} type="number" min="1" placeholder={form.kind === "percent" ? "20" : "50"} value={form.value} onChange={(e) => set("value", e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Applies</label>
          <select className={inputCls} value={form.duration} onChange={(e) => set("duration", e.target.value)}>
            <option value="once">Once (first invoice)</option>
            <option value="repeating">Repeating (N months)</option>
            <option value="forever">Forever</option>
          </select>
        </div>
        {form.duration === "repeating" && (
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Months</label>
            <input className={inputCls} type="number" min="1" value={form.durationMonths} onChange={(e) => set("durationMonths", e.target.value)} />
          </div>
        )}
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Max uses (optional)</label>
          <input className={inputCls} type="number" min="1" placeholder="unlimited" value={form.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Expires in days (optional)</label>
          <input className={inputCls} type="number" min="1" placeholder="never" value={form.expiresInDays} onChange={(e) => set("expiresInDays", e.target.value)} />
        </div>
        <div className="flex items-end">
          <button onClick={create} disabled={creating}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create promo
          </button>
        </div>
        {err && <p className="sm:col-span-2 lg:col-span-3 text-sm text-destructive">{err}</p>}
      </div>

      {/* List */}
      {loading ? (
        <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : promos.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No promo codes yet. Create one above — customers enter it at checkout.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Discount</th>
              <th className="px-4 py-2 font-medium">Used</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 font-mono font-medium">{p.code}</td>
                <td className="px-4 py-2.5">{discountLabel(p)}</td>
                <td className="px-4 py-2.5 tnum">{p.times_redeemed}{p.max_redemptions ? ` / ${p.max_redemptions}` : ""}</td>
                <td className="px-4 py-2.5">
                  {p.active
                    ? <span className="inline-flex items-center gap-1 text-xs text-positive"><Check className="w-3 h-3" /> Active</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><X className="w-3 h-3" /> Off</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => toggle(p)} className="text-xs text-muted-foreground hover:text-foreground underline">
                    {p.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

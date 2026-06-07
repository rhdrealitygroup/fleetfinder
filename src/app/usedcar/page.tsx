"use client";

// PUBLIC consumer used-car search at /usedcar. Reachable only by direct URL —
// intentionally NOT linked from anywhere in the app. Powered by the dumped
// inventory (live fallback). Monetized via dealer click-out + lead capture +
// affiliate CTAs (financing/insurance).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, MapPin, ExternalLink, X, Loader2, Car as CarIcon, ShieldCheck, Banknote } from "lucide-react";
import { CAR_CATALOG, CATALOG_MAKES } from "@/lib/carCatalog";
import { CompassMark } from "@/components/CompassMark";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

type Car = {
  vin: string; year: number; make: string; model: string; trim: string;
  price: number; miles: number; color: string; image: string;
  dealer: string; city: string; state: string; url: string; options: string[];
};

const money = (n: number) => (n > 0 ? "$" + Math.round(n).toLocaleString() : "—");
// Optional affiliate links (set via env to turn the referral CTAs live).
const FINANCE_URL = process.env.NEXT_PUBLIC_AFFILIATE_FINANCE || "";
const INSURANCE_URL = process.env.NEXT_PUBLIC_AFFILIATE_INSURANCE || "";

export default function UsedCarPage() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [results, setResults] = useState<Car[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Car | null>(null);

  const models = make ? CAR_CATALOG[make] || [] : [];
  const makes = useMemo(() => [...CATALOG_MAKES].sort((a, b) => a.localeCompare(b)), []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (make) p.set("make", make);
      if (model) p.set("model", model);
      if (priceMax) p.set("price_max", priceMax);
      if (yearMin) p.set("year_min", yearMin);
      const r = await fetch(`/api/usedcar/search?${p}`);
      const d = await r.json();
      setResults(Array.isArray(d.results) ? d.results : []);
      setTotal(Number(d.total) || 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [make, model, priceMax, yearMin]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Standalone consumer header (not the app nav) */}
      <header className="border-b border-border px-5 py-3 flex items-center gap-2">
        <CompassMark className="w-8 h-8" />
        <span className="font-heading font-bold tracking-tight text-lg">LotCompass</span>
        <span className="text-xs text-muted-foreground ml-2">Used cars</span>
      </header>

      <main className="max-w-6xl mx-auto p-5">
        <h1 className="font-heading text-3xl font-bold mb-1">Find your next used car</h1>
        <p className="text-sm text-muted-foreground mb-6">Thousands of vehicles from trusted dealers.</p>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-2 mb-6">
          <Field label="Make">
            <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); }} className={sel}>
              <option value="">Any make</option>
              {makes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!make} className={sel}>
              <option value="">{make ? "Any model" : "Pick a make"}</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Max price">
            <input value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Any" inputMode="numeric" className={sel} />
          </Field>
          <Field label="Year from">
            <input value={yearMin} onChange={(e) => setYearMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Any" inputMode="numeric" className={sel} />
          </Field>
          <button onClick={search} disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
          </button>
        </div>

        {/* Affiliate CTAs (referral revenue) */}
        {(FINANCE_URL || INSURANCE_URL) && (
          <div className="flex flex-wrap gap-3 mb-6">
            {FINANCE_URL && <a href={FINANCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-border bg-card hover:border-primary/40"><Banknote className="w-4 h-4 text-primary" /> Get pre-qualified for financing</a>}
            {INSURANCE_URL && <a href={INSURANCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-border bg-card hover:border-primary/40"><ShieldCheck className="w-4 h-4 text-primary" /> Compare insurance quotes</a>}
          </div>
        )}

        {/* Results */}
        {results === null ? (
          <div className="text-center text-muted-foreground py-20"><CarIcon className="w-10 h-10 mx-auto mb-3 opacity-40" /> Pick a make and search to see inventory.</div>
        ) : loading ? (
          <div className="text-center text-muted-foreground py-20"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : results.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">No cars matched. Try widening your filters.</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-3">{total.toLocaleString()} result{total === 1 ? "" : "s"}</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((v) => (
                <button key={v.vin} onClick={() => setOpen(v)} className="text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition">
                  <div className="aspect-[4/3] bg-muted/40 flex items-center justify-center overflow-hidden">
                    {v.image ? <img src={v.image} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-2xl uppercase tracking-wide text-muted-foreground">{v.make}</span>}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold">{v.year} {v.make} {v.model}</div>
                    <div className="text-xs text-primary mb-1">{v.trim}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{money(v.price)}</span>
                      <span className="text-xs text-muted-foreground">{v.miles > 0 ? `${v.miles.toLocaleString()} mi` : ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{[v.city, v.state].filter(Boolean).join(", ")}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {open && <DetailModal car={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DetailModal({ car, onClose }: { car: Car; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setErr("");
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) { setErr("Add your name and an email or phone."); return; }
    setSending(true);
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vin: car.vin, dealer_name: car.dealer, vehicle: car }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "Something went wrong."); return; }
      setSent(true);
    } catch { setErr("Something went wrong."); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-[16/9] bg-muted/40 flex items-center justify-center overflow-hidden relative">
          {car.image ? <img src={car.image} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-4xl uppercase tracking-wide text-muted-foreground">{car.make}</span>}
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-heading text-2xl font-bold">{car.year} {car.make} {car.model}</h2>
              <div className="text-primary">{car.trim}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{car.dealer} · {[car.city, car.state].filter(Boolean).join(", ")}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{money(car.price)}</div>
              <div className="text-xs text-muted-foreground">{car.miles > 0 ? `${car.miles.toLocaleString()} mi` : "New"}</div>
            </div>
          </div>

          {car.options?.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Equipment</div>
              <div className="flex flex-wrap gap-1.5">
                {car.options.slice(0, 14).map((o, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">{o}</span>)}
              </div>
            </div>
          )}

          <div className="mt-5 grid sm:grid-cols-2 gap-4">
            {/* Click-out to dealer (referral) */}
            <div>
              {car.url && <a href={car.url.startsWith("http") ? car.url : `https://${car.url}`} target="_blank" rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border hover:border-primary/40 text-sm font-medium"><ExternalLink className="w-4 h-4" /> View at dealer</a>}
            </div>
            {/* Lead capture */}
            <div className="rounded-xl border border-border bg-card p-4">
              {sent ? (
                <div className="text-sm">Thanks! A specialist will reach out about this {car.make} {car.model}.</div>
              ) : (
                <>
                  <div className="text-sm font-medium mb-2">Check availability</div>
                  <div className="space-y-2">
                    <input className={inp} placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} />
                    <input className={inp} placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                    <input className={inp} placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    {err && <div className="text-xs text-destructive">{err}</div>}
                    <button onClick={submit} disabled={sending} className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2">
                      {sending && <Loader2 className="w-4 h-4 animate-spin" />} Request info
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const sel = "rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";
const inp = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}

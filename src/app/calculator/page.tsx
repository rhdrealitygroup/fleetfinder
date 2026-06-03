"use client";

import { useState, useMemo } from "react";
import { AppNav } from "@/components/AppNav";
import { computeLease, TAX_METHODS, type LeaseInput } from "@/lib/lease";
import { money } from "@/lib/format";

// Lease Calculator — real money-factor math. Dealer-sheet inputs on the left,
// customer payment + your cut on the right. Ported math from Base44.

const DEFAULTS: LeaseInput = {
  msrp: 60000, sellingPrice: 57000, residualPct: 58, term: 36,
  buyMF: 0.0015, mfMarkup: 0.0004, priceMarkup: 0, acqFee: 895, flatFee: 0,
  upfrontFees: 700, cashDown: 0, rebates: 0, taxRate: 6.625, taxMethod: "monthly",
};

export default function CalculatorPage() {
  const [v, setV] = useState<LeaseInput>(DEFAULTS);
  const set = (k: keyof LeaseInput, val: number | string) => setV((p) => ({ ...p, [k]: val }));
  const r = useMemo(() => computeLease(v), [v]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto p-5">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold">Lease Calculator</h1>
          <p className="text-sm text-muted-foreground">Enter the dealer numbers — see the customer&apos;s exact monthly and your profit.</p>
        </div>

        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
          {/* Inputs */}
          <div className="space-y-6">
            <Section title="Vehicle">
              <Num label="MSRP" value={v.msrp} onChange={(n) => set("msrp", n)} prefix="$" />
              <Num label="Selling price" value={v.sellingPrice} onChange={(n) => set("sellingPrice", n)} prefix="$" />
              <Num label="Residual %" value={v.residualPct} onChange={(n) => set("residualPct", n)} suffix="%" />
              <Num label="Term (months)" value={v.term} onChange={(n) => set("term", n)} />
            </Section>

            <Section title="Money factor & markup">
              <Num label="Buy money factor" value={v.buyMF} step={0.0001} onChange={(n) => set("buyMF", n)} />
              <Num label="MF markup" value={v.mfMarkup} step={0.0001} onChange={(n) => set("mfMarkup", n)} />
              <Num label="Price markup" value={v.priceMarkup} onChange={(n) => set("priceMarkup", n)} prefix="$" />
              <Num label="Flat / doc fee (profit)" value={v.flatFee} onChange={(n) => set("flatFee", n)} prefix="$" />
            </Section>

            <Section title="Fees, down & tax">
              <Num label="Acquisition fee" value={v.acqFee} onChange={(n) => set("acqFee", n)} prefix="$" />
              <Num label="Upfront fees (reg, etc.)" value={v.upfrontFees} onChange={(n) => set("upfrontFees", n)} prefix="$" />
              <Num label="Cash down" value={v.cashDown} onChange={(n) => set("cashDown", n)} prefix="$" />
              <Num label="Rebates" value={v.rebates} onChange={(n) => set("rebates", n)} prefix="$" />
              <Num label="Tax rate" value={v.taxRate} step={0.001} onChange={(n) => set("taxRate", n)} suffix="%" />
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Tax method</span>
                <select value={v.taxMethod} onChange={(e) => set("taxMethod", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50">
                  {TAX_METHODS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            </Section>
          </div>

          {/* Results */}
          <div className="lg:sticky lg:top-[73px] h-fit space-y-4">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-6">
              <div className="text-xs font-mono uppercase tracking-widest text-primary mb-1">Customer pays</div>
              <div className="text-5xl font-bold tnum">{money(r.customerMonthly)}<span className="text-lg text-muted-foreground font-normal">/mo</span></div>
              <div className="text-sm text-muted-foreground mt-2 tnum">Due at signing: {money(r.dueAtSigning)}</div>
            </div>

            <div className="rounded-xl border border-positive/40 bg-positive/5 p-5">
              <div className="text-xs font-mono uppercase tracking-widest text-positive mb-1">Your cut</div>
              <div className="text-3xl font-bold tnum">{money(r.totalCut)}</div>
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                <Row label="Price markup" value={money(v.priceMarkup || 0)} />
                <Row label="Flat / doc fee" value={money(v.flatFee || 0)} />
                <Row label="MF reserve" value={money(r.mfReserve)} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 text-sm space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Breakdown</div>
              <Row label="Residual $" value={money(r.residual$)} />
              <Row label="Sell money factor" value={r.sellMF.toFixed(5)} />
              <Row label="Equivalent APR" value={`${r.apr.toFixed(2)}%`} />
              <Row label="Adjusted cap cost" value={money(r.adjCap)} />
              <Row label="Depreciation / mo" value={money(r.depreciation)} />
              <Row label="Rent charge / mo" value={money(r.rentCharge)} />
              <Row label="Base payment" value={money(r.baseMonthly)} />
              <Row label="Monthly tax" value={money(r.monthlyTax)} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-sm font-semibold mb-4">{title}</div>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Num({ label, value, onChange, prefix, suffix, step }: { label: string; value?: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring/50">
        {prefix && <span className="pl-3 text-muted-foreground text-sm">{prefix}</span>}
        <input type="number" step={step || 1} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none tnum" />
        {suffix && <span className="pr-3 text-muted-foreground text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tnum">{value}</span></div>;
}

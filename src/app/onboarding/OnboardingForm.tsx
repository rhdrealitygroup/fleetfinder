"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

export function OnboardingForm({ initialFullName, initialCompany, isAgent = false, joiningCompany = "" }: { initialFullName: string; initialCompany: string; isAgent?: boolean; joiningCompany?: string }) {
  const [fullName, setFullName] = useState(initialFullName);
  const [company, setCompany] = useState(initialCompany);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/account/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Agents don't set a company — they already belong to one.
        body: JSON.stringify(isAgent ? { fullName } : { fullName, companyName: company }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Something went wrong — try again."); setLoading(false); return; }
      // Owner must add a card to start the trial → send them straight to Stripe
      // Checkout. (Agents and comped/dev owners skip this and go to the app.)
      if (d.needsPayment) {
        try {
          const cr = await fetch("/api/stripe/checkout", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: "onboarding", seats: 0 }),
          });
          const cd = await cr.json().catch(() => ({}));
          if (cr.ok && cd.url) { window.location.href = cd.url; return; }
          // Couldn't start checkout → land on the payment step to retry with a button.
          window.location.href = "/onboarding?checkout=cancelled";
          return;
        } catch {
          window.location.href = "/onboarding?checkout=cancelled";
          return;
        }
      }
      window.location.href = "/search";
    } catch {
      setError("Something went wrong — try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Your full name</label>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Broker" className={inputCls} />
      </div>
      {isAgent ? (
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Company</label>
          <div className={`${inputCls} bg-muted/40 text-muted-foreground`}>{joiningCompany || "Your company"}</div>
          <p className="text-[11px] text-muted-foreground mt-1">You were invited to this company by its owner.</p>
        </div>
      ) : (
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Leasing company name</label>
          <input required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Auto Leasing" className={inputCls} />
          <p className="text-[11px] text-muted-foreground mt-1">You can invite agents to this company later in Team.</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-60">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />} {isAgent ? "Finish setup →" : "Continue to payment →"}
      </button>
    </form>
  );
}

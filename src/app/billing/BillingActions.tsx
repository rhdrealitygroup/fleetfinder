"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

// Client island: start checkout (with optional extra seats) or open the
// Stripe customer portal.
export function BillingActions({ hasSubscription, baseMonthly = 100, defaultSeats = 0 }: { hasSubscription: boolean; baseMonthly?: number; defaultSeats?: number }) {
  const [seats, setSeats] = useState(defaultSeats);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function go(path: string, body?: object) {
    setLoading(path);
    setError("");
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Something went wrong");
      if (d.url) window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }

  if (hasSubscription) {
    return (
      <div>
        <button onClick={() => go("/api/stripe/portal")} disabled={!!loading}
          className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
          {loading === "/api/stripe/portal" && <Loader2 className="w-4 h-4 animate-spin" />} Manage billing & seats
        </button>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 text-sm">
        Additional agents:
        <input type="number" min={defaultSeats} value={seats} onChange={(e) => setSeats(Math.max(defaultSeats, Number(e.target.value)))}
          className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 tnum focus:outline-none focus:ring-2 focus:ring-ring/50" />
        <span className="text-muted-foreground">× $15/mo</span>
      </label>
      {defaultSeats > 0 && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          You already added {defaultSeats} agent{defaultSeats === 1 ? "" : "s"} during your trial — they&apos;re included in your seat count.
        </p>
      )}
      <div className="text-sm text-muted-foreground">
        Total: <span className="text-foreground font-semibold tnum">${baseMonthly + seats * 15}/mo</span> after the 14-day trial
      </div>
      <button onClick={() => go("/api/stripe/checkout", { seats })} disabled={!!loading}
        className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
        {loading === "/api/stripe/checkout" && <Loader2 className="w-4 h-4 animate-spin" />} Start subscription
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

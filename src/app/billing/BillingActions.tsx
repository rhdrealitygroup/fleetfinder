"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

// Client island: start checkout (with optional extra seats) or open the
// Stripe customer portal.
export function BillingActions({ hasSubscription }: { hasSubscription: boolean }) {
  const [seats, setSeats] = useState(0);
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
        <input type="number" min={0} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value)))}
          className="w-20 rounded-lg border border-border bg-card px-3 py-1.5 tnum focus:outline-none focus:ring-2 focus:ring-ring/50" />
        <span className="text-muted-foreground">× $15/mo</span>
      </label>
      <div className="text-sm text-muted-foreground">
        Total: <span className="text-foreground font-semibold tnum">${100 + seats * 15}/mo</span> after the 14-day trial
      </div>
      <button onClick={() => go("/api/stripe/checkout", { seats })} disabled={!!loading}
        className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
        {loading === "/api/stripe/checkout" && <Loader2 className="w-4 h-4 animate-spin" />} Start subscription
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

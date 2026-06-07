"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

// Client island: start checkout (with optional extra seats) or open the
// Stripe customer portal.
export function BillingActions({
  hasSubscription, baseMonthly = 100, defaultSeats = 0,
  cancelAtPeriodEnd = false, endLabel = "", trialing = false,
}: {
  hasSubscription: boolean; baseMonthly?: number; defaultSeats?: number;
  cancelAtPeriodEnd?: boolean; endLabel?: string; trialing?: boolean;
}) {
  const [seats, setSeats] = useState(defaultSeats);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceled, setCanceled] = useState(cancelAtPeriodEnd);
  const [note, setNote] = useState("");

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

  // Cancel (resume=false) or resume (resume=true) the subscription.
  async function setCancel(resume: boolean) {
    setLoading("cancel");
    setError("");
    setConfirmCancel(false);
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Something went wrong");
      setCanceled(!resume);
      setNote(resume ? "Subscription resumed — it will renew as normal." : "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  }

  if (hasSubscription) {
    return (
      <div className="space-y-3">
        {canceled ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            {trialing
              ? <>Your trial ends{endLabel ? ` ${endLabel}` : ""} and <span className="font-medium">won&apos;t convert to a paid plan</span> — you won&apos;t be charged.</>
              : <>Your plan is set to cancel{endLabel ? ` on ${endLabel}` : " at the end of the period"} — you keep access until then.</>}
          </div>
        ) : null}
        {note && <p className="text-sm text-positive">{note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => go("/api/stripe/portal")} disabled={!!loading}
            className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
            {loading === "/api/stripe/portal" && <Loader2 className="w-4 h-4 animate-spin" />} Manage billing & seats
          </button>

          {canceled ? (
            <button onClick={() => setCancel(true)} disabled={!!loading}
              className="px-4 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-white/5 transition flex items-center gap-2 disabled:opacity-60">
              {loading === "cancel" && <Loader2 className="w-4 h-4 animate-spin" />} Resume subscription
            </button>
          ) : confirmCancel ? (
            <>
              <span className="text-sm text-muted-foreground">
                {trialing ? "End the trial without being charged?" : "Cancel at the end of this period?"}
              </span>
              <button onClick={() => setCancel(false)} disabled={!!loading}
                className="px-4 py-2.5 rounded-lg border border-destructive bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 transition flex items-center gap-2 disabled:opacity-60">
                {loading === "cancel" && <Loader2 className="w-4 h-4 animate-spin" />} {trialing ? "Yes, end trial" : "Yes, cancel"}
              </button>
              <button onClick={() => { setError(""); setConfirmCancel(false); }} disabled={!!loading}
                className="px-3 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-60">
                Keep it
              </button>
            </>
          ) : (
            <button onClick={() => { setError(""); setConfirmCancel(true); }} disabled={!!loading}
              className="px-4 py-2.5 rounded-lg border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition disabled:opacity-60">
              {trialing ? "Cancel before trial ends" : "Cancel subscription"}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
      <p className="text-[11px] text-muted-foreground">
        No card on file during your trial — you&apos;re never charged unless you start a subscription. If you start one, you can cancel any time before the trial ends and pay nothing.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

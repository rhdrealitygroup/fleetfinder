"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";

// Step 2 of owner onboarding: the signup card gate. Two states:
//   • "payment"   — show the trial explainer + a button that opens Stripe Checkout
//   • "finalize"  — returning from Checkout (?checkout=success): confirm the card
//                   landed (poll /api/account/finalize) then enter the app
// `cancelled` is the "payment" state shown after the user backed out of Checkout.
export function OnboardingPayment({ mode }: { mode: "payment" | "finalize" | "cancelled" }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stuck, setStuck] = useState(false); // finalize kept coming back pending
  const started = useRef(false);

  async function startCheckout() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "onboarding", seats: 0 }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      // Already subscribed (e.g. a duplicate tab finished first) → just enter the app.
      if (d.alreadySubscribed || d.comped) { window.location.href = "/search"; return; }
      setError(d.error || "Couldn't open checkout — please try again.");
      setLoading(false);
    } catch {
      setError("Couldn't open checkout — please try again.");
      setLoading(false);
    }
  }

  // Finalize: poll a few times (the sub exists the instant Checkout completes, but
  // give Stripe/our mirror a moment), then fall back to a manual refresh prompt.
  useEffect(() => {
    if (mode !== "finalize" || started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const r = await fetch("/api/account/finalize", { method: "POST" });
          const d = await r.json().catch(() => ({}));
          if (d.ok) { window.location.href = "/search"; return; }
        } catch { /* keep polling */ }
        await new Promise((res) => setTimeout(res, 1500));
      }
      if (!cancelled) setStuck(true);
    })();
    return () => { cancelled = true; };
  }, [mode]);

  if (mode === "finalize") {
    return (
      <div className="text-center py-6">
        {!stuck ? (
          <>
            <Loader2 className="w-7 h-7 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Starting your free trial…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Almost there — your trial is being set up.</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition">
              Continue →
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Add a card to start your 14-day free trial</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">You won&apos;t be charged today. After 14 days it&apos;s $100/mo + $15/mo per agent — cancel any time before then and pay nothing.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-positive shrink-0" />
          Card details are entered securely on Stripe — we never see or store them.
        </div>
      </div>

      {mode === "cancelled" && (
        <p className="text-[13px] text-warning">
          Your trial hasn&apos;t started yet — add a card below to begin. You won&apos;t be charged today.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <button onClick={startCheckout} disabled={loading} className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-60">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />} Add payment method →
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Mail, MessageCircle, Gift } from "lucide-react";

// Small stat tile for the referral dashboard.
function Stat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-positive" : "text-foreground"}`}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// "Give $50, get $50" share panel. `compact` renders the Account-overview hero
// card; full renders the dedicated page body.
export function ReferralPanel({ code, invited = 0, joined = 0, earned = 0, credit = 0, pending = 0, compact = false }:
  { code: string; invited?: number; joined?: number; earned?: number; credit?: number; pending?: number; compact?: boolean }) {
  const [link, setLink] = useState(`/r/${code}`);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setLink(`${window.location.origin}/r/${code}`); }, [code]);

  const msg = `I use LotCompass to search live lease inventory across every dealer in one place — you should try it. Use my link and we each get $50: ${link}`;
  const mailto = `mailto:?subject=${encodeURIComponent("Try LotCompass — we each get $50")}&body=${encodeURIComponent(msg)}`;
  const sms = `sms:?&body=${encodeURIComponent(msg)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  function copy() {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  }

  return (
    <div className={`rounded-2xl border border-primary/30 bg-primary/[0.06] ${compact ? "p-5" : "p-7"}`}>
      <div className="flex items-center gap-2 text-primary mb-1">
        <Gift className="w-5 h-5" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Refer &amp; earn</span>
      </div>
      <h2 className={`font-heading font-bold ${compact ? "text-2xl" : "text-3xl"} mb-1`}>Give $50, get $50.</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Invite another broker. They get <span className="text-foreground font-medium">$50 off</span>, and you get <span className="text-foreground font-medium">$50 credit</span> the moment they subscribe.
      </p>

      {/* link + copy */}
      <div className="flex items-stretch gap-2 mb-3">
        <div className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-mono truncate flex items-center">{link}</div>
        <button onClick={copy} className="shrink-0 inline-flex items-center gap-2 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition">
          {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
        </button>
      </div>

      {/* share actions */}
      <div className="flex flex-wrap gap-2">
        <a href={mailto} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"><Mail className="w-4 h-4" /> Email an invite</a>
        <a href={sms} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"><MessageCircle className="w-4 h-4" /> Text it</a>
        <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
      </div>

      {/* stats */}
      <div className="mt-5 pt-4 border-t border-border/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Stat label="Credit available" value={`$${credit}`} accent />
          <Stat label="Earned total" value={`$${earned}`} />
          <Stat label="Brokers joined" value={joined} />
          <Stat label="Invites sent" value={invited} />
        </div>
        {(pending > 0 || credit > 0) && (
          <p className="text-[12px] text-muted-foreground mt-3">
            {credit > 0 && <>Your <span className="text-foreground font-medium">${credit}</span> credit is applied automatically to your next invoice. </>}
            {pending > 0 && <><span className="text-foreground font-medium">${pending}</span> more lands when your pending referrals make their first payment.</>}
          </p>
        )}
      </div>
    </div>
  );
}

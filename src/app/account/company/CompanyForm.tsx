"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

// Edit company name + your own name. Reuses /api/account/onboard, which renames
// the org (owner only) and updates the caller's profile/membership name.
export function CompanyForm({ initialCompany, initialFullName, canRenameCompany }: { initialCompany: string; initialFullName: string; canRenameCompany: boolean }) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [fullName, setFullName] = useState(initialFullName);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // After a save + router.refresh(), reflect the server's canonical (trimmed) values.
  useEffect(() => { setCompany(initialCompany); setFullName(initialFullName); }, [initialCompany, initialFullName]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/account/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, companyName: company }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Couldn't save — try again."); return; }
      setMsg("Saved ✓");
      router.refresh();
    } catch {
      setErr("Couldn't save — try again.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-md">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Company name</label>
        <input required value={company} onChange={(e) => setCompany(e.target.value)} disabled={!canRenameCompany} className={`${inputCls} ${!canRenameCompany ? "opacity-60" : ""}`} />
        {!canRenameCompany && <p className="text-[11px] text-muted-foreground mt-1">Only the company owner can rename the company.</p>}
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Your full name</label>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
        </button>
        {msg && <span className="text-sm text-positive">{msg}</span>}
        {err && <span className="text-sm text-destructive">{err}</span>}
      </div>
    </form>
  );
}

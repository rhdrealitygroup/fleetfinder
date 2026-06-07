"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Building2, Search, Check, Phone, ExternalLink, Star, Clock, X } from "lucide-react";
import { useOrgDealers } from "@/lib/useOrgDealers";

type RemReq = { id: string; dealer_key: string; dealer_name: string | null; requested_by_email: string | null; created_at: string };

type Dealer = {
  id: string; name: string; street: string; city: string; state: string; zip: string;
  phone: string; type: string; group: string; website: string; listing_count: number;
  makes?: string[];
};

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function DealersPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [type, setType] = useState("");
  const [make, setMake] = useState("");
  const [makes, setMakes] = useState<string[]>([]);
  const [items, setItems] = useState<Dealer[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ all: number }>({ all: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);

  const { items: selected, add, remove, reload, ready } = useOrgDealers();
  const selectedIds = useMemo(() => new Set(selected.map((d) => d.id)), [selected]);

  const [role, setRole] = useState<string | null>(null);
  const isManager = role === "owner" || role === "admin";
  const [requests, setRequests] = useState<RemReq[]>([]);
  const [requestedKeys, setRequestedKeys] = useState<Set<string>>(new Set());

  const loadRequests = useCallback(async () => {
    try { const r = await fetch("/api/dealers/removal-requests"); const d = await r.json(); setRequests(Array.isArray(d.requests) ? d.requests : []); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setRole(d?.role || null)).catch(() => {});
    loadRequests();
  }, [loadRequests]);

  async function requestRemoval(d: Dealer) {
    setRequestedKeys((s) => new Set(s).add(d.id));
    const rollback = () => setRequestedKeys((s) => { const n = new Set(s); n.delete(d.id); return n; });
    try {
      const r = await fetch("/api/dealers/removal-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealer_key: d.id, name: d.name }),
      });
      if (!r.ok) rollback(); // failed → let them retry
    } catch { rollback(); }
  }

  async function actOnRequest(id: string, action: "approve" | "dismiss") {
    const prevRequests = requests;
    setRequests((prev) => prev.filter((r) => r.id !== id));
    try {
      const r = await fetch("/api/dealers/removal-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      if (!r.ok) { setRequests(prevRequests); return; } // failed → restore the row so it can be retried
      // Approve removes the dealer for the whole org — refresh both the request
      // queue AND the dealer selection so it disappears (checkmark/border/count)
      // without a manual reload.
      if (action === "approve") { loadRequests(); reload(); }
    } catch { setRequests(prevRequests); }
  }

  const loadSeq = useRef(0);
  const load = useCallback(async (pageNum: number, replace: boolean) => {
    // Sequence guard: a filter change can fire a new request while an older one
    // is still in flight; if the older response lands last it would overwrite the
    // newer results (stale make/state/search). Only the latest request may write.
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (state) params.set("state", state);
      if (type) params.set("type", type);
      if (make) params.set("make", make);
      params.set("page", String(pageNum));
      const res = await fetch(`/api/dealers/catalog?${params}`);
      const d = await res.json().catch(() => ({}));
      if (seq !== loadSeq.current) return; // superseded by a newer request — drop
      // Guard: an error/auth response (e.g. 401) has no `items` — never spread
      // undefined into state (that crashed the whole app before).
      const incoming = Array.isArray(d.items) ? d.items : [];
      setTotal(Number(d.total) || 0);
      if (d.counts) setCounts(d.counts);
      if (Array.isArray(d.makes) && d.makes.length) setMakes(d.makes);
      setItems((prev) => (replace ? incoming : [...prev, ...incoming]));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [q, state, type, make]);

  // Reload on filter change (debounced for the text query).
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); load(0, true); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (d: Dealer) => {
    if (!selectedIds.has(d.id)) { add({ id: d.id, name: d.name, city: d.city, state: d.state }); return; }
    // Selected dealer: owners/admins remove directly; agents request removal.
    // Wait until the role has loaded so an owner isn't mis-routed into "request".
    if (role === null) return;
    if (isManager) remove(d.id);
    else requestRemoval(d);
  };

  const shown: Dealer[] = onlySelected
    ? selected.map((s) => ({ id: s.id, name: s.name || "", street: "", city: s.city || "", state: s.state || "", zip: "", phone: "", type: "", group: "", website: "", listing_count: 0 }))
    : items;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
          <div>
            <h1 className="font-heading text-2xl font-bold">Your dealer list</h1>
            <p className="text-sm text-muted-foreground">Pick the dealers you work with — {(counts.all || 0).toLocaleString()} dealers nationwide.</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm">
            <span className="font-semibold text-primary">{selected.length}</span> <span className="text-muted-foreground">selected</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dealer, group, city, ZIP…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" />
          </div>
          <select value={state} onChange={(e) => setState(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="">All states</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={make} onChange={(e) => setMake(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="">All makes</option>
            {makes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="">All types</option>
            <option value="franchise">Franchise</option>
            <option value="independent">Independent</option>
          </select>
          <button onClick={() => setOnlySelected((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm border transition ${onlySelected ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground hover:border-white/30"}`}>
            <Star className="w-3.5 h-3.5 inline mr-1" />My dealers
          </button>
        </div>

        {/* Removal requests (owner/admin only) */}
        {isManager && requests.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 mb-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-warning" /> Dealer removal requests ({requests.length})</div>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.dealer_name || r.dealer_key}<span className="text-xs text-muted-foreground"> · requested by {r.requested_by_email || "an agent"}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <button onClick={() => actOnRequest(r.id, "approve")} className="text-xs font-medium px-2.5 py-1 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25">Remove</button>
                    <button onClick={() => actOnRequest(r.id, "dismiss")} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!onlySelected && (
          <div className="text-xs text-muted-foreground mb-2">{total.toLocaleString()} match{total === 1 ? "" : "es"}</div>
        )}

        {/* List */}
        <div className="space-y-1.5">
          {shown.map((d) => {
            const on = selectedIds.has(d.id);
            // A pending removal request only matters while the dealer is still
            // selected. Once it's actually removed (on === false), reset to the
            // normal "add" state instead of leaving the clock stuck + disabled.
            const pendingRemoval = on && requestedKeys.has(d.id);
            return (
              <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${on ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                <button onClick={() => pendingRemoval ? undefined : toggle(d)} disabled={pendingRemoval}
                  title={on ? (isManager ? "Remove" : pendingRemoval ? "Removal requested" : "Request removal") : "Add to my dealers"}
                  className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center transition ${on ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>
                  {pendingRemoval ? <Clock className="w-3.5 h-3.5" /> : on ? <Check className="w-4 h-4" /> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{d.name}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${d.type === "franchise" ? "bg-emerald-500/15 text-emerald-600" : "bg-stone-500/15 text-muted-foreground"}`}>{d.type}</span>
                    {d.group && <span className="text-[11px] text-muted-foreground">· {d.group}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[d.city, d.state].filter(Boolean).join(", ")} {d.zip} · {(d.listing_count || 0).toLocaleString()} in stock
                  </div>
                  {d.makes && d.makes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.makes.slice(0, 8).map((m) => (
                        <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded ${make === m ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>{m}</span>
                      ))}
                      {d.makes.length > 8 && <span className="text-[10px] text-muted-foreground">+{d.makes.length - 8}</span>}
                    </div>
                  )}
                </div>
                {d.phone && <a href={`tel:${d.phone}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{d.phone}</a>}
                {d.website && <a href={d.website.startsWith("http") ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="w-4 h-4" /></a>}
              </div>
            );
          })}
        </div>

        {onlySelected && selected.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-4 opacity-40" />
            <p className="text-foreground font-medium mb-1">No dealers selected yet</p>
            <p className="text-sm">Turn off &ldquo;My dealers&rdquo; and check the dealers you work with.</p>
          </div>
        )}

        {!onlySelected && items.length < total && (
          <button onClick={() => { const p = page + 1; setPage(p); load(p, false); }} disabled={loading}
            className="mt-4 w-full py-2.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
            {loading ? "Loading…" : `Load more (${(total - items.length).toLocaleString()} more)`}
          </button>
        )}

        {ready && <p className="text-[11px] text-muted-foreground mt-4">Saved to your company — shared across your team, and searches scope to these dealers by default.</p>}
      </main>
    </div>
  );
}

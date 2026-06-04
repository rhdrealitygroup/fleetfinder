"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { Building2, Search, Check, Phone, ExternalLink, Star } from "lucide-react";
import { useLocalCollection } from "@/lib/useLocalCollection";

type Dealer = {
  id: string; name: string; street: string; city: string; state: string; zip: string;
  phone: string; type: string; group: string; website: string; listing_count: number;
};

export default function DealersPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [type, setType] = useState("");
  const [items, setItems] = useState<Dealer[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ all: number; nj: number; ny: number }>({ all: 0, nj: 0, ny: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);

  const { items: selected, setItems: setSelected, ready } = useLocalCollection<Dealer>("ff_dealers", 2000);
  const selectedIds = useMemo(() => new Set(selected.map((d) => d.id)), [selected]);

  const load = useCallback(async (pageNum: number, replace: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (state) params.set("state", state);
      if (type) params.set("type", type);
      params.set("page", String(pageNum));
      const res = await fetch(`/api/dealers/catalog?${params}`);
      const d = await res.json();
      setTotal(d.total || 0);
      if (d.counts) setCounts(d.counts);
      setItems((prev) => (replace ? d.items : [...prev, ...d.items]));
    } finally {
      setLoading(false);
    }
  }, [q, state, type]);

  // Reload on filter change (debounced for the text query).
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); load(0, true); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (d: Dealer) => {
    if (selectedIds.has(d.id)) setSelected(selected.filter((s) => s.id !== d.id));
    else setSelected([d, ...selected]);
  };

  const shown = onlySelected ? selected : items;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
          <div>
            <h1 className="font-heading text-2xl font-bold">Your dealer list</h1>
            <p className="text-sm text-muted-foreground">Pick the dealers you work with — {counts.all.toLocaleString()} across NJ ({counts.nj.toLocaleString()}) &amp; NY ({counts.ny.toLocaleString()}).</p>
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
            <option value="NJ">New Jersey</option>
            <option value="NY">New York</option>
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

        {!onlySelected && (
          <div className="text-xs text-muted-foreground mb-2">{total.toLocaleString()} match{total === 1 ? "" : "es"}</div>
        )}

        {/* List */}
        <div className="space-y-1.5">
          {shown.map((d) => {
            const on = selectedIds.has(d.id);
            return (
              <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${on ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                <button onClick={() => toggle(d)} title={on ? "Remove" : "Add to my dealers"}
                  className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center transition ${on ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}>
                  {on && <Check className="w-4 h-4" />}
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

        {ready && <p className="text-[11px] text-muted-foreground mt-4">Your selections save to this browser. Next: sync to your team + scope searches to your dealers.</p>}
      </main>
    </div>
  );
}

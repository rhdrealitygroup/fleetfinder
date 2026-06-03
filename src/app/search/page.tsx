"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, SlidersHorizontal, ArrowUpDown, Star, Building2, X, Check,
  Award, GitCompare, Loader2, ExternalLink, FileText,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { CAR_CATALOG, CATALOG_MAKES } from "@/lib/carCatalog";
import { FEATURE_GROUPS, PRICE_RANGES, YEAR_RANGES, SORTS, makeHue } from "@/lib/inventory";
import { moneyShort } from "@/lib/format";
import { useLocalCollection } from "@/lib/useLocalCollection";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Vehicle = {
  vin: string; year: number; make: string; model: string; trim: string; version: string;
  price: number; msrp: number; est_monthly: number; exterior_color: string;
  base_color: string; mileage: number; dealer_name: string; city: string;
  state: string; latitude: number; longitude: number; listing_url: string;
  dealer_url: string; image_url: string; photo_gallery: string[];
  monroney_url: string; inventory_type: string; is_cpo: boolean;
  status: string; days_listed: number; features: string[];
};

type Variant = { label: string; count: number };
type Trim = { name: string; count: number; available: boolean; msrp?: number; variants?: Variant[] };

const FEATURE_PICKS = FEATURE_GROUPS.flatMap((g) => g.items);

export default function SearchPage() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [variant, setVariant] = useState("");
  const [trims, setTrims] = useState<Trim[]>([]);
  const [trimsLoading, setTrimsLoading] = useState(false);
  const [yearIdx, setYearIdx] = useState(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [carType, setCarType] = useState<"new" | "used">("new");

  const [results, setResults] = useState<Vehicle[] | null>(null);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState("distance");
  const [open, setOpen] = useState<Vehicle | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { items: saved, setItems: setSaved, ready } = useLocalCollection<Vehicle>("ff_saved");
  const savedVins = useMemo(() => new Set(saved.map((s) => s.vin)), [saved]);
  const [compare, setCompare] = useState<Set<string>>(new Set());

  const models = make ? CAR_CATALOG[make] || [] : [];

  // Load trims whenever make+model are both set.
  useEffect(() => {
    if (!make || !model) {
      setTrims([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrimsLoading(true);
    fetch("/api/list-trims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ make, model, car_type: carType }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTrims(Array.isArray(d.trims) ? d.trims : []);
      })
      .catch(() => !cancelled && setTrims([]))
      .finally(() => !cancelled && setTrimsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [make, model, carType]);

  const toggleFeature = (v: string) =>
    setFeatures((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  const toggleSaved = (v: Vehicle) => {
    if (savedVins.has(v.vin)) setSaved(saved.filter((s) => s.vin !== v.vin));
    else setSaved([v, ...saved]);
  };
  const toggleCompare = (vin: string) =>
    setCompare((prev) => {
      const n = new Set(prev);
      if (n.has(vin)) n.delete(vin);
      else n.add(vin);
      return n;
    });

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError("");
    setOpen(null);
    try {
      const yr = YEAR_RANGES[yearIdx];
      const pr = PRICE_RANGES[priceIdx];
      const res = await fetch("/api/live-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          car_type: carType, make, model, trim, variant,
          year_min: yr.min || undefined, year_max: yr.max || undefined,
          price_min: pr.min || undefined, price_max: pr.max || undefined,
          features: [...features],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Search failed");
      setResults(d.results || []);
      setTotal(d.total || 0);
      setTruncated(!!d.truncated);
      setProvider(d.provider || "");
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [make, model, trim, variant, yearIdx, priceIdx, features, carType]);

  // The variant (range/config) chips for the currently-selected trim.
  const activeVariants = trim ? trims.find((t) => t.name === trim)?.variants || [] : [];

  const sorted = useMemo(() => {
    if (!results) return [];
    const arr = [...results];
    switch (sort) {
      case "price_asc": return arr.sort((a, b) => a.price - b.price);
      case "price_desc": return arr.sort((a, b) => b.price - a.price);
      case "monthly_asc": return arr.sort((a, b) => a.est_monthly - b.est_monthly);
      case "monthly_desc": return arr.sort((a, b) => b.est_monthly - a.est_monthly);
      case "recent": return arr.sort((a, b) => a.days_listed - b.days_listed);
      default: return arr; // distance — API already sorts
    }
  }, [results, sort]);

  // Filter panel — rendered in the desktop sidebar AND the mobile drawer.
  const filterContent = (
    <div className="space-y-5">
      <div className="flex rounded-lg border border-border overflow-hidden text-sm">
        {(["new", "used"] as const).map((t) => (
          <button key={t} onClick={() => setCarType(t)}
            className={`flex-1 py-1.5 capitalize transition ${carType === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      <Field label="Make">
        <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); setTrim(""); setVariant(""); }} className={selectCls}>
          <option value="">Any make</option>
          {CATALOG_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>

      <Field label="Model">
        <select value={model} onChange={(e) => { setModel(e.target.value); setTrim(""); setVariant(""); }} disabled={!make} className={selectCls}>
          <option value="">{make ? "Any model" : "Pick a make first"}</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>

      {/* Trim picker — lives with the filters, populated once make+model set */}
      {make && model && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Trim {trimsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <TrimPill label="All trims" active={trim === ""} onClick={() => { setTrim(""); setVariant(""); }} />
            {trims.map((t) => (
              <TrimPill key={t.name} label={t.name} count={t.count} dim={!t.available}
                active={trim === t.name} onClick={() => { setTrim(t.name); setVariant(""); }} />
            ))}
            {!trimsLoading && trims.length === 0 && (
              <span className="text-xs text-muted-foreground py-1.5">No trims found — search still runs.</span>
            )}
          </div>
          {activeVariants.length > 0 && (
            <div className="mt-3 pl-3 border-l-2 border-primary/30">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{trim} configuration</div>
              <div className="flex flex-wrap gap-2">
                <TrimPill label="Any" active={variant === ""} onClick={() => setVariant("")} />
                {activeVariants.map((v) => (
                  <TrimPill key={v.label} label={v.label} count={v.count}
                    active={variant === v.label} onClick={() => setVariant(v.label)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Field label="Year"><select value={yearIdx} onChange={(e) => setYearIdx(Number(e.target.value))} className={selectCls}>{YEAR_RANGES.map((y, i) => <option key={y.label} value={i}>{y.label}</option>)}</select></Field>
      <Field label="Price"><select value={priceIdx} onChange={(e) => setPriceIdx(Number(e.target.value))} className={selectCls}>{PRICE_RANGES.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}</select></Field>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Must-have features</div>
        <div className="flex flex-wrap gap-1.5">
          {FEATURE_PICKS.slice(0, 14).map((f) => {
            const on = features.has(f.value);
            return (
              <button key={f.value} onClick={() => toggleFeature(f.value)}
                className={`px-2 py-1 rounded-md text-[11px] border transition ${on ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground hover:border-white/30"}`}>
                {on && <Check className="w-3 h-3 inline mr-1" />}{f.label}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={() => { runSearch(); setFiltersOpen(false); }} disabled={searching}
        className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-60">
        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {searching ? "Searching…" : "Run live search"}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav live={142118} />

      {/* Mobile filter bar — opens the drawer */}
      <div className="lg:hidden sticky top-[57px] z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setFiltersOpen(true)} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-card min-w-0">
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="truncate">{[make, model, trim].filter(Boolean).join(" ") || "Filters"}</span>
        </button>
        {results !== null && <span className="text-xs text-muted-foreground shrink-0">{total || sorted.length} results</span>}
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border p-5 h-[calc(100vh-57px)] sticky top-[57px] overflow-y-auto">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          </div>
          {filterContent}
        </aside>

        {/* ── Results ─────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 p-4 sm:p-5">
          {/* Result bar */}
          {results !== null && (
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">{total || sorted.length}</span> matches
                {provider && <span className="ml-2 text-xs">· via {provider}</span>}
                {truncated && <span className="ml-2 text-xs text-warning">· showing first {sorted.length}, refine to narrow</span>}
              </div>
              <div className="flex items-center gap-2">
                {compare.size > 0 && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 border border-primary/40 text-primary text-sm">
                    <GitCompare className="w-4 h-4" /> Compare ({compare.size})
                  </span>
                )}
                <div className="relative">
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-card border border-border text-sm focus:outline-none cursor-pointer">
                    {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ArrowUpDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm mb-4">{error}</div>}

          {/* Empty / initial states */}
          {results === null && !searching && (
            <div className="text-center py-24 text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium text-foreground mb-1">Search live inventory</p>
              <p className="text-sm">Open <span className="lg:hidden">Filters</span><span className="hidden lg:inline">the filters</span>, pick a make and model, choose a trim, and run a live search.</p>
            </div>
          )}
          {searching && (
            <div className="text-center py-24 text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
              <p>Searching live inventory near Oakhurst, NJ…</p>
            </div>
          )}
          {results !== null && !searching && sorted.length === 0 && !error && (
            <div className="text-center py-24 text-muted-foreground">
              <p className="text-lg font-medium text-foreground mb-1">No matches</p>
              <p className="text-sm">Try a different trim, widen the year/price, or drop a feature filter.</p>
            </div>
          )}

          {/* Results grid */}
          {!searching && sorted.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {sorted.map((v) => (
                <VehicleCard key={v.vin || `${v.dealer_name}-${v.price}`} v={v}
                  saved={savedVins.has(v.vin)} compareOn={compare.has(v.vin)}
                  onOpen={() => setOpen(v)} onSave={() => toggleSaved(v)} onCompare={() => toggleCompare(v.vin)} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setFiltersOpen(false)} />
          <div className="relative w-[85%] max-w-xs bg-background border-r border-border h-full overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="font-semibold flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Filters</span>
              <button onClick={() => setFiltersOpen(false)} className="w-8 h-8 rounded-md hover:bg-white/10 flex items-center justify-center text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            {filterContent}
          </div>
        </div>
      )}

      {open && <DetailPanel v={open} onClose={() => setOpen(null)} saved={savedVins.has(open.vin)} onSave={() => toggleSaved(open)} />}
      {!ready && null}
    </div>
  );
}

const selectCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span><div className="mt-1">{children}</div></label>;
}

function TrimPill({ label, count, active, dim, onClick }: { label: string; count?: number; active: boolean; dim?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${active ? "bg-foreground text-background border-foreground font-medium" : dim ? "bg-card/50 border-border text-muted-foreground/60 hover:text-foreground" : "bg-card border-border text-foreground hover:border-white/40"}`}>
      {label}{typeof count === "number" && count > 0 && <span className="ml-1.5 text-[11px] opacity-60 tnum">{count.toLocaleString()}</span>}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    "In Stock": { c: "#34d399", t: "In stock" }, "In Transit": { c: "#fbbf24", t: "In transit" }, "On Order": { c: "#60a5fa", t: "On order" },
  };
  const m = map[status] || map["In Stock"];
  return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ color: m.c, background: `${m.c}22` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: m.c }} /> {m.t}</span>;
}

function VehicleCard({ v, saved, compareOn, onOpen, onSave, onCompare }: { v: Vehicle; saved: boolean; compareOn: boolean; onOpen: () => void; onSave: () => void; onCompare: () => void }) {
  const hue = makeHue(v.make);
  return (
    <div onClick={onOpen} className={`lift group relative rounded-xl border bg-card p-3 cursor-pointer flex flex-col ${compareOn ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <StatusPill status={v.status} />
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onCompare(); }} className={`w-7 h-7 rounded-md flex items-center justify-center transition ${compareOn ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}><GitCompare className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onSave(); }} className={`w-7 h-7 rounded-md flex items-center justify-center transition ${saved ? "text-amber-400" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}><Star className="w-4 h-4" fill={saved ? "currentColor" : "none"} /></button>
        </div>
      </div>
      <div className="relative h-32 rounded-lg overflow-hidden flex items-center justify-center mb-3 border border-border" style={{ background: v.image_url ? undefined : `linear-gradient(135deg, hsl(${hue} 40% 22%), hsl(${hue} 30% 12%))` }}>
        {v.image_url
          ? <img src={v.image_url} alt={`${v.year} ${v.make} ${v.model}`} className="w-full h-full object-cover" loading="lazy" />
          : <span className="font-heading font-semibold tracking-[0.18em] text-lg uppercase text-white/70">{v.make}</span>}
        {v.is_cpo && <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-[10px] font-medium text-white"><Award className="w-3 h-3" /> CPO</span>}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-semibold text-[15px] truncate">{v.year} {v.make} {v.model}</div>{v.trim && <div className="text-sm text-primary font-medium truncate">{v.trim}</div>}{v.version && v.version.toLowerCase() !== v.trim.toLowerCase() && <div className="text-[11px] text-muted-foreground truncate">{v.version}</div>}</div>
        <div className="text-right shrink-0"><div className="font-semibold tnum">{moneyShort(v.price)}</div>{v.est_monthly > 0 && <div className="text-[11px] text-muted-foreground tnum">~{moneyShort(v.est_monthly)}/mo</div>}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {v.exterior_color && <Chip>{v.exterior_color}</Chip>}
        {v.mileage > 0 && <Chip>{v.mileage.toLocaleString()} mi</Chip>}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5 shrink-0" /> {v.dealer_name || "—"}</span>
        {v.city && <span className="shrink-0">{v.city}, {v.state}</span>}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground">{children}</span>;
}

function DetailPanel({ v, onClose, saved, onSave }: { v: Vehicle; onClose: () => void; saved: boolean; onSave: () => void }) {
  const hue = makeHue(v.make);
  const [decode, setDecode] = useState<any>(null);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    if (!v.vin || v.vin.length !== 17) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecoding(true);
    fetch("/api/decode-vin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: v.vin }) })
      .then((r) => r.json()).then((d) => !d.error && setDecode(d)).catch(() => {}).finally(() => setDecoding(false));
  }, [v.vin]);

  const packages: any[] = decode?.packages || [];
  const options: any[] = decode?.options || [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
          <span className="font-semibold">Vehicle details</span>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-white/10 flex items-center justify-center text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="h-48 flex items-center justify-center border-b border-border" style={{ background: v.image_url ? undefined : `linear-gradient(135deg, hsl(${hue} 40% 22%), hsl(${hue} 30% 12%))` }}>
          {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : <span className="font-heading font-semibold tracking-[0.2em] text-2xl uppercase text-white/70">{v.make}</span>}
        </div>
        <div className="p-5 space-y-5">
          <div>
            <StatusPill status={v.status} />
            <h2 className="text-xl font-semibold mt-2">{v.year} {v.make} {v.model}</h2>
            {v.trim && <div className="text-primary font-medium">{v.trim}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Spec label="Price" value={moneyShort(v.price)} />
            <Spec label="Est. monthly" value={v.est_monthly > 0 ? `${moneyShort(v.est_monthly)}/mo` : "—"} />
            <Spec label="Exterior" value={v.exterior_color || "—"} />
            <Spec label="Mileage" value={v.mileage > 0 ? `${v.mileage.toLocaleString()} mi` : "New"} />
          </div>
          {v.features.length > 0 && (
            <div><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Highlights</div>
              <div className="flex flex-wrap gap-1.5">{v.features.map((f) => <span key={f} className="px-2 py-1 rounded-md bg-primary/10 border border-primary/25 text-[12px] text-primary">{f}</span>)}</div></div>
          )}
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">Equipment (VIN decode){decoding && <Loader2 className="w-3 h-3 animate-spin" />}</div>
            {!v.vin && <p className="text-sm text-muted-foreground">No VIN on this listing.</p>}
            {packages.length === 0 && options.length === 0 && !decoding && v.vin && <p className="text-sm text-muted-foreground">No decoded equipment available.</p>}
            <div className="flex flex-wrap gap-1.5">
              {packages.map((p, i) => <span key={i} className="px-2 py-1 rounded-md bg-primary/10 border border-primary/25 text-[12px] text-primary">{p.name}</span>)}
              {options.slice(0, 12).map((o, i) => <span key={i} className="px-2 py-1 rounded-md bg-secondary border border-border text-[12px] text-muted-foreground">{o.name}</span>)}
            </div>
          </div>
          <div className="rounded-lg bg-secondary border border-border p-3 flex items-center gap-3 text-sm">
            <Building2 className="w-5 h-5 text-muted-foreground" /><div><div className="font-medium">{v.dealer_name || "—"}</div>{v.city && <div className="text-muted-foreground text-xs">{v.city}, {v.state}</div>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/calculator" className="flex-1 text-center py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition">Calculate lease</a>
            <button onClick={onSave} className="px-4 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm font-medium transition flex items-center gap-2"><Star className="w-4 h-4" fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}</button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {v.listing_url && <a href={v.listing_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline"><ExternalLink className="w-4 h-4" /> View listing</a>}
            {v.monroney_url && <a href={v.monroney_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline"><FileText className="w-4 h-4" /> Window sticker</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-secondary border border-border p-2.5"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="font-medium tnum">{value}</div></div>;
}

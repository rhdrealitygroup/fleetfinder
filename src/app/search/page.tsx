"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, SlidersHorizontal, ArrowUpDown, Star, Building2, X, Check,
  Award, GitCompare, Loader2, ExternalLink, FileText, MapPin,
} from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { CAR_CATALOG, CATALOG_MAKES } from "@/lib/carCatalog";
import { FEATURE_GROUPS, PRICE_RANGES, YEAR_RANGES, SORTS, BODY_TYPES, DRIVETRAINS, makeHue } from "@/lib/inventory";
import { moneyShort } from "@/lib/format";
import { useSavedVehicles } from "@/lib/useSavedVehicles";
import { useOrgDealers } from "@/lib/useOrgDealers";

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
type Color = { name: string; count: number; variants: string[] };

const FEATURE_PICKS = FEATURE_GROUPS.flatMap((g) => g.items);
const OPTION_CATS = ["Packages", "Exterior", "Interior", "Mechanical", "Entertainment", "Safety & Service", "Other"];

function SearchPageInner() {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [variant, setVariant] = useState("");
  const [trims, setTrims] = useState<Trim[]>([]);
  const [trimsLoading, setTrimsLoading] = useState(false);
  const [color, setColor] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [wantColor, setWantColor] = useState(""); // requested color from URL, matched once colors load
  const [intColor, setIntColor] = useState("");
  const [intColors, setIntColors] = useState<Color[]>([]);
  const [intColorsLoading, setIntColorsLoading] = useState(false);
  const [featureOpts, setFeatureOpts] = useState<{ value: string; label: string; msrp: number; count: number; cat: string }[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [yearIdx, setYearIdx] = useState(0);
  const [priceIdx, setPriceIdx] = useState(0);
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [carType, setCarType] = useState<"new" | "used">("new");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState(100);
  const [maxMonthly, setMaxMonthly] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [drivetrain, setDrivetrain] = useState("");

  const [results, setResults] = useState<Vehicle[] | null>(null);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [note, setNote] = useState("");
  const [rateLimited, setRateLimited] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState("distance");
  const [open, setOpen] = useState<Vehicle | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { items: saved, save, remove: removeSaved, has: hasSaved, lists, ready } = useSavedVehicles();
  const { items: myDealers } = useOrgDealers();
  const [scopeDealers, setScopeDealers] = useState(true); // default: search your dealers
  const [searchedAll, setSearchedAll] = useState(false);  // last search overrode to all dealers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  // Prefill criteria from the URL (e.g. opened via a customer's "Search").
  // Uses useSearchParams so it re-applies on client-side navigation too — e.g.
  // clicking a different customer's "Search" while already on /search (a soft
  // nav that does NOT remount, so a one-time window.location read would miss it).
  const searchParams = useSearchParams();
  useEffect(() => {
    const m = searchParams.get("make"), md = searchParams.get("model");
    const z = searchParams.get("zip"), mx = searchParams.get("max"), cl = searchParams.get("color");
    if (m) setMake(m);
    if (md) setModel(md);
    if (z) setZip(z);
    if (mx) setMaxMonthly(mx);
    setWantColor(cl || "");
  }, [searchParams]);

  // Once colors load, map a requested color (from a customer's needs) to a real
  // color option and select it.
  useEffect(() => {
    if (!wantColor || !colors.length) return;
    const w = wantColor.toLowerCase();
    const match = colors.find((c) => c.name.toLowerCase() === w)
      || colors.find((c) => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase()));
    if (match) setColor(match.name);
    setWantColor("");
  }, [colors, wantColor]);

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

  // Load make/model-specific exterior colors whenever make is set.
  useEffect(() => {
    if (!make) {
      setColors([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColorsLoading(true);
    fetch("/api/list-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ make, model, car_type: carType }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setColors(Array.isArray(d.colors) ? d.colors : []);
      })
      .catch(() => !cancelled && setColors([]))
      .finally(() => !cancelled && setColorsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [make, model, carType]);

  // Load make/model-specific interior colors whenever make is set.
  useEffect(() => {
    if (!make) { setIntColors([]); return; }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntColorsLoading(true);
    fetch("/api/list-interior-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ make, model, car_type: carType }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setIntColors(Array.isArray(d.colors) ? d.colors : []); })
      .catch(() => !cancelled && setIntColors([]))
      .finally(() => !cancelled && setIntColorsLoading(false));
    return () => { cancelled = true; };
  }, [make, model, carType]);

  // Load make/model-specific options/features whenever make is set.
  useEffect(() => {
    if (!make) {
      setFeatureOpts([]);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeaturesLoading(true);
    fetch("/api/list-features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ make, model, car_type: carType }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFeatureOpts(Array.isArray(d.features) ? d.features : []);
      })
      .catch(() => !cancelled && setFeatureOpts([]))
      .finally(() => !cancelled && setFeaturesLoading(false));
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
  // List-aware toggle: un-saving only removes the VIN from THIS list, never
  // from other named customer lists.
  const toggleSaved = (v: Vehicle, list = "Saved") => {
    if (hasSaved(v.vin, list)) removeSaved({ vin: v.vin, list });
    else save(v, list);
  };
  const toggleCompare = (vin: string) => {
    if (!vin) return; // VIN-less listings share the "" key — don't let one toggle all
    setCompare((prev) => {
      const n = new Set(prev);
      if (n.has(vin)) n.delete(vin);
      else n.add(vin);
      return n;
    });
  };

  const runSearch = useCallback(async (opts?: { radiusOverride?: number; allDealers?: boolean; dropOption?: string; clearMaxMonthly?: boolean; clearVariant?: boolean; clearIntColor?: boolean }) => {
    const effRadius = opts?.radiusOverride ?? radius;
    if (opts?.radiusOverride) setRadius(opts.radiusOverride);
    const useDealers = scopeDealers && myDealers.length > 0 && !opts?.allDealers;
    const effFeatures = opts?.dropOption ? [...features].filter((f) => f !== opts.dropOption) : [...features];
    // Diagnose "clear X" fixes pass the cleared value explicitly so the search
    // re-runs with it dropped immediately (state setters won't have flushed yet).
    const effVariant = opts?.clearVariant ? "" : variant;
    const effIntColor = opts?.clearIntColor ? "" : intColor;
    const effMaxMonthly = opts?.clearMaxMonthly ? "" : maxMonthly;
    setSearchedAll(!!opts?.allDealers);
    setDiagnosis(null);
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
          car_type: carType, make, model, trim, variant: effVariant,
          exterior_color: (colors.find((c) => c.name === color)?.variants || []).join(",") || undefined,
          interior_color: (intColors.find((c) => c.name === effIntColor)?.variants || []).join(",") || undefined,
          zip: zip.trim() || undefined, radius: effRadius,
          max_monthly: Number(effMaxMonthly) || undefined,
          body_type: bodyType || undefined, drivetrain: drivetrain || undefined,
          year_min: yr.min || undefined, year_max: yr.max || undefined,
          price_min: pr.min || undefined, price_max: pr.max || undefined,
          option_names: effFeatures.length ? effFeatures : undefined,
          dealer_ids: useDealers ? myDealers.map((d) => d.id).filter(Boolean) : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Search failed");
      setResults(d.results || []);
      setTotal(d.total || 0);
      setTruncated(!!d.truncated);
      setNote(typeof d.note === "string" ? d.note.trim() : "");
      setProvider(d.provider || "");
      setRateLimited(!!d.rateLimited);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
      // Clear stale result metadata so a failed search doesn't show the previous
      // search's "N matches" count next to the error banner.
      setTotal(0); setTruncated(false); setNote(""); setProvider(""); setRateLimited(false);
    } finally {
      setSearching(false);
    }
  }, [make, model, trim, variant, color, colors, intColor, intColors, yearIdx, priceIdx, features, carType, zip, radius, maxMonthly, bodyType, drivetrain, scopeDealers, myDealers]);

  // The variant (range/config) chips for the currently-selected trim.
  const activeVariants = trim ? trims.find((t) => t.name === trim)?.variants || [] : [];

  const sorted = useMemo(() => {
    if (!results) return [];
    const arr = [...results];
    switch (sort) {
      case "price_asc": return arr.sort((a, b) => a.price - b.price);
      case "price_desc": return arr.sort((a, b) => b.price - a.price);
      // Treat unknown (0) as +Infinity so "no estimate" cars sort to the BOTTOM
      // for low→high, instead of masquerading as the cheapest. Same for unknown
      // days_listed on "recently added".
      // Compare via </> (not subtraction) so two unknowns (Infinity) don't yield
      // Infinity - Infinity = NaN, which makes Array.sort order unstable.
      case "monthly_asc": return arr.sort((a, b) => { const x = a.est_monthly || Infinity, y = b.est_monthly || Infinity; return x === y ? 0 : x < y ? -1 : 1; });
      case "monthly_desc": return arr.sort((a, b) => b.est_monthly - a.est_monthly);
      case "recent": return arr.sort((a, b) => { const x = a.days_listed || Infinity, y = b.days_listed || Infinity; return x === y ? 0 : x < y ? -1 : 1; });
      default: return arr; // distance — API already sorts
    }
  }, [results, sort]);

  const diagSeq = useRef(0);
  const runDiagnose = useCallback(async () => {
    const seq = ++diagSeq.current; // only the latest diagnose may write state
    setDiagnosing(true);
    try {
      const yr = YEAR_RANGES[yearIdx], pr = PRICE_RANGES[priceIdx];
      const useDealers = scopeDealers && myDealers.length > 0 && !searchedAll;
      const r = await fetch("/api/diagnose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          car_type: carType, make, model, trim, variant: variant || undefined,
          exterior_color: (colors.find((c) => c.name === color)?.variants || []).join(",") || undefined,
          interior_color: (intColors.find((c) => c.name === intColor)?.variants || []).join(",") || undefined,
          option_names: features.size ? [...features] : undefined,
          year_min: yr.min || undefined, year_max: yr.max || undefined,
          price_min: pr.min || undefined, price_max: pr.max || undefined,
          max_monthly: Number(maxMonthly) || undefined,
          zip: zip.trim() || undefined, radius,
          dealer_ids: useDealers ? myDealers.map((d) => d.id) : undefined,
        }),
      });
      const d = await r.json();
      if (seq === diagSeq.current) setDiagnosis(d); // drop stale out-of-order responses
    } catch {
      /* ignore */
    } finally {
      if (seq === diagSeq.current) setDiagnosing(false);
    }
  }, [make, model, trim, variant, color, colors, intColor, intColors, features, yearIdx, priceIdx, maxMonthly, zip, radius, carType, scopeDealers, myDealers, searchedAll]);

  // When a search returns nothing, diagnose why — but NOT when the emptiness is a
  // rate-limit (diagnose would fire a second MarketCheck call and likely 429 again).
  useEffect(() => {
    if (results !== null && !searching && sorted.length === 0 && !error && make && !rateLimited) runDiagnose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, searching]);

  function applyFix(fix: { action: string; value?: string }) {
    if (fix.action === "all_dealers") runSearch({ allDealers: true });
    else if (fix.action === "radius") runSearch({ radiusOverride: Number(fix.value) || 500 });
    else if (fix.action === "drop_option" && fix.value) {
      const v = fix.value;
      setFeatures((prev) => { const n = new Set(prev); n.delete(v); return n; });
      runSearch({ dropOption: v });
    }
    else if (fix.action === "drop_max_monthly") { setMaxMonthly(""); runSearch({ clearMaxMonthly: true }); }
    else if (fix.action === "drop_variant") { setVariant(""); runSearch({ clearVariant: true }); }
    else if (fix.action === "drop_interior_color") { setIntColor(""); runSearch({ clearIntColor: true }); }
  }

  function exportCsv() {
    const head = ["Year", "Make", "Model", "Trim", "Version", "Price", "Est Monthly", "Color", "Mileage", "Dealer", "City", "State", "VIN", "Listing"];
    const rows = [head, ...sorted.map((v) => [v.year, v.make, v.model, v.trim, v.version, v.price, v.est_monthly, v.exterior_color, v.mileage, v.dealer_name, v.city, v.state, v.vin, v.listing_url])];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleetfinder-${[make, model].filter(Boolean).join("-") || "search"}.csv`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
  }

  // Filter panel — rendered in the desktop sidebar AND the mobile drawer.
  const filterContent = (
    <div className="space-y-5">
      <div className="flex rounded-lg border border-border overflow-hidden text-sm">
        {(["new", "used"] as const).map((t) => (
          <button key={t} onClick={() => { setCarType(t); setTrim(""); setVariant(""); setColor(""); setIntColor(""); setFeatures(new Set()); }}
            className={`flex-1 py-1.5 capitalize transition ${carType === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Customer location — search around the customer's ZIP */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary font-medium">
          <MapPin className="w-3.5 h-3.5" /> Customer location
        </div>
        <div className="flex gap-2">
          <input
            type="text" inputMode="numeric" maxLength={5} placeholder="ZIP code"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}
            className="rounded-lg border border-border bg-card px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50">
            {[25, 50, 100, 250, 500].map((r) => <option key={r} value={r}>{r} mi</option>)}
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">{zip ? `Searching within ${radius} mi of ${zip}.` : "Enter your customer's ZIP for inventory near them."}</p>
        {myDealers.length > 0 && (
          <button onClick={() => setScopeDealers((v) => !v)}
            className={`w-full mt-1 px-2 py-1.5 rounded-lg text-[12px] border transition flex items-center justify-center gap-1.5 ${scopeDealers ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}>
            <Building2 className="w-3.5 h-3.5" />{scopeDealers ? `Showing only your ${myDealers.length} dealers` : `Limit to my ${myDealers.length} dealers`}
          </button>
        )}
      </div>

      <Field label="Make">
        <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); setTrim(""); setVariant(""); setColor(""); setIntColor(""); setFeatures(new Set()); }} className={selectCls}>
          <option value="">Any make</option>
          {[...CATALOG_MAKES].sort((a, b) => a.localeCompare(b)).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>

      <Field label="Model">
        <select value={model} onChange={(e) => { setModel(e.target.value); setTrim(""); setVariant(""); setColor(""); setIntColor(""); setFeatures(new Set()); }} disabled={!make} className={selectCls}>
          <option value="">{make ? "Any model" : "Pick a make first"}</option>
          {[...models].sort((a, b) => a.localeCompare(b)).map((m) => <option key={m} value={m}>{m}</option>)}
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

      {/* Exterior color — make/model-specific, pulled live from MarketCheck */}
      {make && (
        <Field label="Exterior color">
          <select value={color} onChange={(e) => setColor(e.target.value)} className={selectCls} disabled={colorsLoading && colors.length === 0}>
            <option value="">{colorsLoading && colors.length === 0 ? "Loading colors…" : "Any color"}</option>
            {colors.map((c) => <option key={c.name} value={c.name}>{c.name}{c.count ? ` · ${c.count.toLocaleString()}` : ""}</option>)}
          </select>
        </Field>
      )}

      {/* Interior color — make/model-specific, pulled live from MarketCheck */}
      {make && (
        <Field label="Interior color">
          <select value={intColor} onChange={(e) => setIntColor(e.target.value)} className={selectCls} disabled={intColorsLoading && intColors.length === 0}>
            <option value="">{intColorsLoading && intColors.length === 0 ? "Loading colors…" : "Any interior"}</option>
            {intColors.map((c) => <option key={c.name} value={c.name}>{c.name}{c.count ? ` · ${c.count.toLocaleString()}` : ""}</option>)}
          </select>
        </Field>
      )}

      <Field label="Year"><select value={yearIdx} onChange={(e) => setYearIdx(Number(e.target.value))} className={selectCls}>{YEAR_RANGES.map((y, i) => <option key={y.label} value={i}>{y.label}</option>)}</select></Field>
      <Field label="Price"><select value={priceIdx} onChange={(e) => setPriceIdx(Number(e.target.value))} className={selectCls}>{PRICE_RANGES.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}</select></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Body"><select value={bodyType} onChange={(e) => setBodyType(e.target.value)} className={selectCls}><option value="">Any</option>{BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
        <Field label="Drivetrain"><select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value)} className={selectCls}><option value="">Any</option>{DRIVETRAINS.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
      </div>

      <Field label="Max monthly payment">
        <div className="flex items-center rounded-lg border border-border bg-card focus-within:ring-2 focus-within:ring-ring/50">
          <span className="pl-3 text-muted-foreground text-sm">$</span>
          <input type="number" inputMode="numeric" placeholder="e.g. 700" value={maxMonthly}
            onChange={(e) => setMaxMonthly(e.target.value.replace(/\D/g, ""))}
            className="w-full bg-transparent px-2 py-2 text-sm focus:outline-none tnum" />
          <span className="pr-3 text-muted-foreground text-xs">/mo</span>
        </div>
      </Field>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center gap-2">
          Must-have options {featuresLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          {make && !featuresLoading && featureOpts.length > 0 && <span className="normal-case tracking-normal text-muted-foreground/70">· {make}{model ? ` ${model}` : ""}</span>}
        </div>
        {make && featureOpts.length > 0 ? (
          <div className="space-y-2.5">
            {OPTION_CATS.map((cat) => {
              const items = featureOpts.filter((o) => o.cat === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">{cat} <span className="opacity-60">{items.length}</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((f) => {
                      const on = features.has(f.value);
                      return (
                        <button key={f.value} onClick={() => toggleFeature(f.value)}
                          className={`px-2 py-1 rounded-md text-[11px] border transition ${on ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground hover:border-white/30"}`}>
                          {on && <Check className="w-3 h-3 inline mr-1" />}{f.label}{f.msrp ? <span className="opacity-50 ml-1">${f.msrp.toLocaleString()}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground pt-0.5">Real options from build sheets of in-stock {make} {model}, grouped like the configurator · prices are factory MSRP.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {!make && FEATURE_PICKS.slice(0, 16).map((f) => {
              const on = features.has(f.value);
              return (
                <button key={f.value} onClick={() => toggleFeature(f.value)}
                  className={`px-2 py-1 rounded-md text-[11px] border transition ${on ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground hover:border-white/30"}`}>
                  {on && <Check className="w-3 h-3 inline mr-1" />}{f.label}
                </button>
              );
            })}
            {make && !featuresLoading && <span className="text-xs text-muted-foreground py-1.5">No model-specific options found — generic list shown.</span>}
            {!make && <span className="text-[11px] text-muted-foreground py-1.5 w-full">Pick a make to see its real factory options.</span>}
          </div>
        )}
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
      <AppNav />

      {/* Mobile filter bar — only after a search has run; lets you reopen the
          criteria. Before the first search the criteria form IS the page. */}
      {results !== null && (
        <div className="lg:hidden sticky top-[57px] z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between gap-2">
          <button onClick={() => setFiltersOpen(true)} className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-border bg-card min-w-0">
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span className="truncate">{[make, model, trim].filter(Boolean).join(" ") || "Edit search"}</span>
          </button>
          <span className="text-xs text-muted-foreground shrink-0">{total || sorted.length} results</span>
        </div>
      )}

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
                {zip ? <span className="ml-1">within {radius} mi of {zip}</span> : <span className="ml-1">nationwide</span>}
                {myDealers.length > 0 && scopeDealers && !searchedAll && (
                  <span className="ml-1">· <span className="text-primary font-medium">your {myDealers.length} dealers</span>
                    <button onClick={() => runSearch({ allDealers: true })} className="ml-2 underline hover:text-foreground">search all dealers</button>
                  </span>
                )}
                {searchedAll && myDealers.length > 0 && <span className="ml-1">· all dealers</span>}
                {truncated && <span className="ml-2 text-xs text-warning">· showing first {sorted.length}</span>}
                {note && <span className="ml-2 text-xs text-warning">{note}</span>}
              </div>
              <div className="flex items-center gap-2">
                {sorted.length > 0 && (
                  <button onClick={exportCsv} title="Export to CSV"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition">
                    <FileText className="w-4 h-4" /> Export
                  </button>
                )}
                {compare.size > 0 && (
                  <button onClick={() => setCompareOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 border border-primary/40 text-primary text-sm hover:bg-primary/25 transition">
                    <GitCompare className="w-4 h-4" /> Compare ({compare.size})
                  </button>
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

          {/* Initial state. On mobile the criteria form IS the page (no sidebar
              there); on desktop the sidebar holds it, so we show a hint. */}
          {results === null && !searching && (
            <>
              <div className="lg:hidden">
                <div className="mb-4">
                  <h1 className="font-heading text-xl font-bold">Build your search</h1>
                  <p className="text-sm text-muted-foreground">Pick a make and model, choose a trim, then run a live search.</p>
                </div>
                {filterContent}
              </div>
              <div className="hidden lg:block text-center py-24 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium text-foreground mb-1">Search live inventory</p>
                <p className="text-sm">Pick a make and model in the filters on the left, choose a trim, and run a live search.</p>
              </div>
            </>
          )}
          {searching && (
            <div className="text-center py-24 text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
              <p>Searching live inventory nationwide…</p>
            </div>
          )}
          {results !== null && !searching && sorted.length === 0 && !error && (
            <div className="max-w-2xl mx-auto py-14">
              <div className="text-center mb-6">
                <p className="text-lg font-medium text-foreground mb-1">No exact match</p>
                {diagnosing && <p className="text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Figuring out why…</p>}
              </div>

              {diagnosis && !diagnosing && (diagnosis.error || diagnosis.unavailable) && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground text-left">
                  {diagnosis.error || "The inventory service is temporarily unavailable — try again in a moment."}
                </div>
              )}

              {diagnosis && !diagnosing && !diagnosis.error && !diagnosis.unavailable && (
                <div className="space-y-3 text-left">
                  {Array.isArray(diagnosis.reasons) && diagnosis.reasons.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Why no match</div>
                      <ul className="space-y-1.5 text-sm">
                        {diagnosis.reasons.map((r: string, i: number) => <li key={i} className="flex gap-2"><span className="text-warning shrink-0">•</span><span>{r}</span></li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(diagnosis.options) && diagnosis.options.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Your options, in stock?</div>
                      <div className="flex flex-wrap gap-1.5">
                        {diagnosis.options.map((o: { value: string; name: string; available: boolean }) => (
                          <span key={o.value} className={`px-2 py-1 rounded-md text-[12px] border ${o.available ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>{o.available ? "✓" : "✗"} {o.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {diagnosis.closest?.vehicle && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-primary font-medium mb-2">Closest in stock — {diagnosis.closest.matched} of {diagnosis.closest.total} options</div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{diagnosis.closest.vehicle.year} {diagnosis.closest.vehicle.make} {diagnosis.closest.vehicle.model} {diagnosis.closest.vehicle.trim}</div>
                          <div className="text-xs text-muted-foreground truncate">{diagnosis.closest.vehicle.dealer_name}{diagnosis.closest.vehicle.city ? ` · ${diagnosis.closest.vehicle.city}, ${diagnosis.closest.vehicle.state}` : ""}</div>
                          {diagnosis.closest.missing?.length > 0 && <div className="text-xs text-destructive mt-1">Missing: {diagnosis.closest.missing.join(", ")}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold tabular-nums">${(diagnosis.closest.vehicle.price || 0).toLocaleString()}</div>
                          {diagnosis.closest.vehicle.est_monthly > 0 && <div className="text-xs text-muted-foreground">~${diagnosis.closest.vehicle.est_monthly}/mo</div>}
                        </div>
                      </div>
                    </div>
                  )}
                  {Array.isArray(diagnosis.fixes) && diagnosis.fixes.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">One-tap fixes</div>
                      <div className="flex flex-wrap gap-2">
                        {diagnosis.fixes.map((f: { label: string; action: string; value?: string }, i: number) => (
                          <button key={i} onClick={() => applyFix(f)} className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition">{f.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!diagnosis && !diagnosing && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {myDealers.length > 0 && scopeDealers && !searchedAll && (
                    <button onClick={() => runSearch({ allDealers: true })} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition"><Building2 className="w-4 h-4" /> Search all dealers</button>
                  )}
                  {radius < 100 && (
                    <button onClick={() => runSearch({ radiusOverride: 100 })} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-card border border-border hover:border-primary/40 text-sm font-medium transition"><MapPin className="w-4 h-4" /> Search wider</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Results grid */}
          {!searching && sorted.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {sorted.map((v, i) => (
                <VehicleCard key={v.vin || `${v.dealer_name}-${v.price}-${i}`} v={v}
                  saved={hasSaved(v.vin, "Saved")} compareOn={compare.has(v.vin)}
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

      {open && <DetailPanel v={open} onClose={() => setOpen(null)} saved={hasSaved(open.vin, "Saved")} onSave={(list) => toggleSaved(open, list)} lists={lists} />}
      {compareOpen && (
        <CompareModal
          vehicles={(results || []).filter((v) => compare.has(v.vin))}
          onClose={() => setCompareOpen(false)}
          onRemove={(vin) => toggleCompare(vin)}
        />
      )}
      {!ready && null}
    </div>
  );
}

// useSearchParams must be inside a Suspense boundary in the App Router.
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function CompareModal({ vehicles, onClose, onRemove }: { vehicles: Vehicle[]; onClose: () => void; onRemove: (vin: string) => void }) {
  if (!vehicles.length) return null;
  const rows: { label: string; get: (v: Vehicle) => string }[] = [
    { label: "Price", get: (v) => (v.price ? moneyShort(v.price) : "—") },
    { label: "Est. monthly", get: (v) => (v.est_monthly ? `${moneyShort(v.est_monthly)}/mo` : "—") },
    { label: "MSRP", get: (v) => (v.msrp ? moneyShort(v.msrp) : "—") },
    { label: "Off MSRP", get: (v) => (v.msrp > v.price ? moneyShort(v.msrp - v.price) : "—") },
    { label: "Trim", get: (v) => [v.trim, v.version].filter(Boolean).join(" ") || "—" },
    { label: "Color", get: (v) => v.exterior_color || "—" },
    { label: "Mileage", get: (v) => (v.mileage > 0 ? `${v.mileage.toLocaleString()} mi` : "New") },
    { label: "Days on lot", get: (v) => (v.days_listed > 0 ? `${v.days_listed}d` : "—") },
    { label: "Dealer", get: (v) => v.dealer_name || "—" },
    { label: "Location", get: (v) => [v.city, v.state].filter(Boolean).join(", ") || "—" },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl max-w-5xl w-full max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2"><GitCompare className="w-5 h-5 text-primary" /> Compare ({vehicles.length})</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm px-2 py-1">Close ✕</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wide text-muted-foreground sticky left-0 bg-background"></th>
                {vehicles.map((v) => (
                  <th key={v.vin} className="p-3 text-left align-top min-w-[180px]">
                    <div className="font-semibold">{v.year} {v.make} {v.model}</div>
                    <div className="text-xs text-primary">{[v.trim, v.version].filter(Boolean).join(" ")}</div>
                    <button onClick={() => onRemove(v.vin)} className="text-[11px] text-muted-foreground hover:text-foreground underline mt-1">remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="p-3 text-xs text-muted-foreground sticky left-0 bg-background font-medium">{r.label}</td>
                  {vehicles.map((v) => <td key={v.vin} className="p-3 tabular-nums">{r.get(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
      <div className="relative h-44 rounded-2xl overflow-hidden flex items-center justify-center mb-3" style={{ background: v.image_url ? undefined : `linear-gradient(135deg, hsl(${hue} 28% 82%), hsl(${hue} 24% 90%))` }}>
        {v.image_url
          ? <img src={v.image_url} alt={`${v.year} ${v.make} ${v.model}`} className="w-full h-full object-cover" loading="lazy" />
          : <span className="font-heading font-semibold tracking-[0.14em] text-2xl uppercase" style={{ color: `hsl(${hue} 30% 42%)` }}>{v.make}</span>}
        {v.is_cpo && <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-[10px] font-medium text-white"><Award className="w-3 h-3" /> CPO</span>}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-semibold text-[15px] truncate">{v.year} {v.make} {v.model}</div>{v.trim && <div className="text-sm text-primary font-medium truncate">{v.trim}</div>}{v.version && v.version.toLowerCase() !== v.trim.toLowerCase() && <div className="text-[11px] text-muted-foreground truncate">{v.version}</div>}</div>
        <div className="text-right shrink-0"><div className="font-semibold tnum">{moneyShort(v.price)}</div>{v.est_monthly > 0 && <div className="text-[11px] text-muted-foreground tnum">~{moneyShort(v.est_monthly)}/mo</div>}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {v.exterior_color && <Chip>{v.exterior_color}</Chip>}
        {v.mileage > 0 && <Chip>{v.mileage.toLocaleString()} mi</Chip>}
        {v.msrp > v.price && <span className="px-2 py-0.5 rounded-md bg-positive/10 border border-positive/30 text-[11px] text-positive font-medium">{moneyShort(v.msrp - v.price)} off MSRP</span>}
        {v.days_listed > 0 && <span className="px-2 py-0.5 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground">{v.days_listed}d on lot</span>}
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

function DetailPanel({ v, onClose, saved, onSave, lists }: { v: Vehicle; onClose: () => void; saved: boolean; onSave: (list: string) => void; lists: string[] }) {
  const hue = makeHue(v.make);
  const [decode, setDecode] = useState<any>(null);
  const [decoding, setDecoding] = useState(false);
  const [listName, setListName] = useState("");

  useEffect(() => {
    if (!v.vin || v.vin.length !== 17) return;
    // Guard against an out-of-order resolve overwriting the now-current VIN's
    // equipment when the panel switches vehicles mid-request (matches the
    // cancelled-flag pattern used by the other fetch effects in this file).
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecoding(true);
    fetch("/api/decode-vin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: v.vin }) })
      .then((r) => r.json()).then((d) => { if (!cancelled && !d.error) setDecode(d); }).catch(() => {}).finally(() => { if (!cancelled) setDecoding(false); });
    return () => { cancelled = true; };
  }, [v.vin]);

  const packages: any[] = Array.isArray(decode?.packages) ? decode.packages : [];
  const options: any[] = Array.isArray(decode?.options) ? decode.options : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
          <span className="font-semibold">Vehicle details</span>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-white/10 flex items-center justify-center text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="h-48 flex items-center justify-center border-b border-border" style={{ background: v.image_url ? undefined : `linear-gradient(135deg, hsl(${hue} 28% 82%), hsl(${hue} 24% 90%))` }}>
          {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : <span className="font-heading font-semibold tracking-[0.2em] text-3xl uppercase" style={{ color: `hsl(${hue} 30% 42%)` }}>{v.make}</span>}
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
            {decode?.interior_color ? <Spec label="Interior" value={decode.interior_color} /> : <Spec label="Mileage" value={v.mileage > 0 ? `${v.mileage.toLocaleString()} mi` : "New"} />}
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
            <div className="flex items-center gap-2">
              <input list="lc-lists" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="List (e.g. Smith family)"
                className="w-40 rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" />
              <datalist id="lc-lists">{lists.map((l) => <option key={l} value={l} />)}</datalist>
              <button onClick={() => onSave(listName.trim() || "Saved")} className="px-4 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm font-medium transition flex items-center gap-2"><Star className="w-4 h-4" fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}</button>
            </div>
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

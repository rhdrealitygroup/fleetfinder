"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Star,
  Building2,
  Zap,
  X,
  Check,
  ChevronDown,
  MapPin,
  Award,
  GitCompare,
} from "lucide-react";

// ─── SEARCH PAGE REDESIGN PREVIEW ─────────────────────────────────────────
// Modern (dark, product-first) direction applied to the actual product —
// the Live Search page. Mock data, real interactivity (open a card, toggle
// filters). This is what an agent sees after logging in.

type Vehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dist: number;
  color: string;
  dealer: string;
  status: "In Stock" | "In Transit" | "On Order";
  ev?: boolean;
  cpo?: boolean;
  hue: number;
  features: string[];
};

const MOCK: Vehicle[] = [
  { id: "1", year: 2026, make: "Ford", model: "Expedition", trim: "King Ranch", price: 78420, miles: 12, dist: 14, color: "Agate Black", dealer: "Galpin Ford", status: "In Stock", cpo: false, hue: 210, features: ["Captain's Chairs", "Premium Tow Pkg", "Panoramic Roof", "Heated + Cooled Seats"] },
  { id: "2", year: 2026, make: "Ford", model: "Expedition", trim: "King Ranch", price: 76990, miles: 8, dist: 22, color: "Star White", dealer: "DCH Ford of Eatontown", status: "In Stock", hue: 210, features: ["Captain's Chairs", "B&O Audio", "360° Camera"] },
  { id: "3", year: 2026, make: "Lincoln", model: "Navigator", trim: "Black Label", price: 102540, miles: 5, dist: 31, color: "Infinite Black", dealer: "Open Road Lincoln", status: "In Transit", hue: 280, features: ["Massage Seats", "30-Way Power Seats", "Rear Entertainment"] },
  { id: "4", year: 2026, make: "Ford", model: "Expedition", trim: "Platinum", price: 81200, miles: 3, dist: 38, color: "Carbonized Gray", dealer: "All American Ford", status: "In Stock", hue: 210, features: ["Captain's Chairs", "Pano Roof", "Active Park Assist"] },
  { id: "5", year: 2025, make: "Ford", model: "Expedition", trim: "Limited", price: 71850, miles: 4200, dist: 44, color: "Rapid Red", dealer: "Ditschman Ford", status: "In Stock", cpo: true, hue: 210, features: ["Heated Seats", "Tow Pkg", "Wireless CarPlay"] },
  { id: "6", year: 2026, make: "Cadillac", model: "Escalade", trim: "Premium Luxury", price: 94300, miles: 11, dist: 51, color: "Black Raven", dealer: "Cadillac of Mahwah", status: "On Order", hue: 0, features: ["Super Cruise", "AKG Audio", "Night Vision"] },
];

const TRIMS = ["All trims", "King Ranch", "Platinum", "Limited", "Black Label", "Premium Luxury"];
const SORTS = ["Distance: nearest", "Price: low to high", "Price: high to low", "Newest listings"];

function money(n: number) {
  return "$" + n.toLocaleString("en-US");
}

export default function SearchPreview() {
  const [openVehicle, setOpenVehicle] = useState<Vehicle | null>(null);
  const [activeTrim, setActiveTrim] = useState("King Ranch");
  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set(["2"]));
  const [sort, setSort] = useState(SORTS[0]);

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSaved = (id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = activeTrim === "All trims" ? MOCK : MOCK.filter((v) => v.trim === activeTrim || activeTrim === "King Ranch");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      {/* Preview ribbon */}
      <div className="bg-blue-600 text-white text-[11px] font-mono uppercase tracking-widest px-4 py-1.5 text-center">
        Product preview · Live Search (redesigned) ·{" "}
        <Link href="/preview" className="underline hover:no-underline">back to chooser</Link>
      </div>

      {/* ── App top bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 px-5 py-3 flex items-center justify-between sticky top-0 bg-neutral-950/90 backdrop-blur z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">F</div>
          <span className="font-semibold tracking-tight">FleetFinder</span>
          <nav className="hidden md:flex items-center gap-1 ml-6 text-sm">
            <span className="px-3 py-1.5 rounded-md bg-white/10 text-white font-medium">Live Search</span>
            <span className="px-3 py-1.5 rounded-md text-neutral-400 hover:text-white cursor-pointer">Calculator</span>
            <span className="px-3 py-1.5 rounded-md text-neutral-400 hover:text-white cursor-pointer">Saved</span>
            <span className="px-3 py-1.5 rounded-md text-neutral-400 hover:text-white cursor-pointer">Dealers</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> 142,118 vehicles live
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs font-semibold text-blue-300">RB</div>
        </div>
      </header>

      <div className="flex">
        {/* ── Filter sidebar ────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-white/10 p-5 space-y-6 h-[calc(100vh-92px)] sticky top-[92px] overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-500 mb-3">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </div>
            <FilterField label="Make"><FakeSelect value="Ford" /></FilterField>
            <FilterField label="Model"><FakeSelect value="Expedition" /></FilterField>
            <FilterField label="Customer ZIP"><FakeInput value="07755 · Oakhurst, NJ" icon={<MapPin className="w-3.5 h-3.5" />} /></FilterField>
            <FilterField label="Max distance"><FakeSelect value="100 miles" /></FilterField>
            <FilterField label="Price"><FakeSelect value="$50k – $100k" /></FilterField>
            <FilterField label="Year"><FakeSelect value="2025 +" /></FilterField>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Must-have features</div>
            <div className="flex flex-wrap gap-1.5">
              {["Captain's Chairs", "Heated Seats", "Tow Pkg", "Pano Roof", "360° Cam", "CarPlay"].map((f, i) => (
                <span key={f} className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer transition ${i < 2 ? "bg-blue-500/15 border-blue-500/40 text-blue-300" : "bg-white/5 border-white/10 text-neutral-400 hover:border-white/30"}`}>
                  {i < 2 && <Check className="w-3 h-3 inline mr-1" />}{f}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition flex items-center justify-center gap-2">
              <Search className="w-4 h-4" /> Run live search
            </button>
            <div className="text-[11px] text-neutral-500 text-center mt-2">10 free searches left this month</div>
          </div>
        </aside>

        {/* ── Results column ─────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 p-5">
          {/* Trim picker — THE thing that was broken before, now first-class */}
          <div className="mb-4">
            <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Trim</div>
            <div className="flex flex-wrap gap-2">
              {TRIMS.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTrim(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    activeTrim === t
                      ? "bg-white text-neutral-900 border-white font-medium"
                      : "bg-white/5 border-white/15 text-neutral-300 hover:border-white/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Result count + sort */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-neutral-400">
              <span className="text-white font-semibold">{visible.length}</span> matches within 100 mi · sorted by distance
            </div>
            <div className="flex items-center gap-2">
              {compare.size > 0 && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500/15 border border-blue-500/40 text-blue-300 text-sm">
                  <GitCompare className="w-4 h-4" /> Compare ({compare.size})
                </button>
              )}
              <div className="relative">
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-white/5 border border-white/15 text-sm text-neutral-200 focus:outline-none cursor-pointer">
                  {SORTS.map((s) => <option key={s} className="bg-neutral-900">{s}</option>)}
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Result grid */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((v) => (
              <VehicleCard
                key={v.id}
                v={v}
                saved={saved.has(v.id)}
                compareChecked={compare.has(v.id)}
                onOpen={() => setOpenVehicle(v)}
                onToggleSaved={() => toggleSaved(v.id)}
                onToggleCompare={() => toggleCompare(v.id)}
              />
            ))}
          </div>
        </main>
      </div>

      {/* ── Detail panel (slide-over) ──────────────────────────────────── */}
      {openVehicle && (
        <DetailPanel v={openVehicle} onClose={() => setOpenVehicle(null)} />
      )}
    </div>
  );
}

/* ─── Components ──────────────────────────────────────────────────────── */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-200 cursor-pointer hover:border-white/30">
      {value} <ChevronDown className="w-4 h-4 text-neutral-500" />
    </div>
  );
}

function FakeInput({ value, icon }: { value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-200">
      {icon}<span>{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: Vehicle["status"] }) {
  const map = {
    "In Stock": { c: "#34d399", t: "In stock" },
    "In Transit": { c: "#fbbf24", t: "In transit" },
    "On Order": { c: "#60a5fa", t: "On order" },
  } as const;
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ color: m.c, background: `${m.c}22` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.c }} /> {m.t}
    </span>
  );
}

function VehicleCard({
  v, saved, compareChecked, onOpen, onToggleSaved, onToggleCompare,
}: {
  v: Vehicle; saved: boolean; compareChecked: boolean;
  onOpen: () => void; onToggleSaved: () => void; onToggleCompare: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className={`group relative rounded-xl border bg-white/[0.03] p-3 cursor-pointer flex flex-col transition hover:bg-white/[0.06] ${compareChecked ? "border-blue-500 ring-2 ring-blue-500/30" : "border-white/10"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <StatusPill status={v.status} />
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onToggleCompare(); }} title="Compare"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition ${compareChecked ? "bg-blue-500/20 text-blue-300" : "text-neutral-500 hover:text-neutral-200 hover:bg-white/10"}`}>
            <GitCompare className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onToggleSaved(); }} title="Save"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition ${saved ? "text-amber-400" : "text-neutral-500 hover:text-neutral-200 hover:bg-white/10"}`}>
            <Star className="w-4 h-4" fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Photo placeholder — brand wordmark gradient (real photos when live) */}
      <div className="relative h-32 rounded-lg overflow-hidden flex items-center justify-center mb-3"
        style={{ background: `linear-gradient(135deg, hsl(${v.hue} 40% 22%), hsl(${v.hue} 30% 12%))` }}>
        <span className="font-heading font-semibold tracking-[0.18em] text-lg uppercase text-white/70">{v.make}</span>
        {v.cpo && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-[10px] font-medium text-white">
            <Award className="w-3 h-3" /> CPO
          </span>
        )}
        {v.ev && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500/90 flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-white" /></span>}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[15px] text-white truncate">{v.year} {v.make} {v.model}</div>
          <div className="text-sm text-blue-300 font-medium">{v.trim}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-white tabular-nums">{money(v.price)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-neutral-400">{v.color}</span>
        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-neutral-400">{v.miles.toLocaleString()} mi</span>
      </div>

      <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
        <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5 shrink-0" /> {v.dealer}</span>
        <span className="flex items-center gap-1 shrink-0 text-neutral-300"><MapPin className="w-3.5 h-3.5" /> {v.dist} mi</span>
      </div>
    </div>
  );
}

function DetailPanel({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 border-l border-white/10 h-full overflow-y-auto">
        <div className="sticky top-0 bg-neutral-900/95 backdrop-blur border-b border-white/10 px-5 py-3 flex items-center justify-between">
          <span className="font-semibold">Vehicle details</span>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-white/10 flex items-center justify-center text-neutral-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="h-48 flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${v.hue} 40% 22%), hsl(${v.hue} 30% 12%))` }}>
          <span className="font-heading font-semibold tracking-[0.2em] text-2xl uppercase text-white/70">{v.make}</span>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <StatusPill status={v.status} />
            <h2 className="text-xl font-semibold mt-2">{v.year} {v.make} {v.model}</h2>
            <div className="text-blue-300 font-medium">{v.trim}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Spec label="Price" value={money(v.price)} />
            <Spec label="Mileage" value={`${v.miles.toLocaleString()} mi`} />
            <Spec label="Exterior" value={v.color} />
            <Spec label="Distance" value={`${v.dist} mi away`} />
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">Equipment (from VIN decode)</div>
            <div className="flex flex-wrap gap-1.5">
              {v.features.map((f) => (
                <span key={f} className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/25 text-[12px] text-blue-200">{f}</span>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-center gap-3 text-sm">
            <Building2 className="w-5 h-5 text-neutral-400" />
            <div><div className="text-white font-medium">{v.dealer}</div><div className="text-neutral-500 text-xs">{v.dist} mi from customer</div></div>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition">Calculate lease</button>
            <button className="px-4 py-2.5 rounded-lg border border-white/15 hover:bg-white/5 text-sm font-medium transition flex items-center gap-2"><Star className="w-4 h-4" /> Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-white font-medium tabular-nums">{value}</div>
    </div>
  );
}

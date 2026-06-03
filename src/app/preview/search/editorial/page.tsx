"use client";

import { useState } from "react";
import { Star, MapPin, X, Award } from "lucide-react";
import { PREVIEW_VEHICLES, PREVIEW_TRIMS, money, type PreviewVehicle } from "@/lib/previewVehicles";
import { StyleSwitcher } from "../StyleSwitcher";

// EDITORIAL search page — cream background, serif headings, monospace data,
// dense table-style rows (a trade-journal "listings" feel rather than cards).

const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

export default function EditorialSearch() {
  const [activeTrim, setActiveTrim] = useState("King Ranch");
  const [open, setOpen] = useState<PreviewVehicle | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set(["2"]));
  const toggleSaved = (id: string) => setSaved((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="min-h-screen text-neutral-900" style={{ backgroundColor: "#FAF8F2", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <StyleSwitcher active="editorial" />

      {/* Masthead */}
      <header className="border-b border-neutral-300 px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <div className="text-2xl font-bold tracking-tight" style={serif}>FleetFinder</div>
          <nav className="hidden md:flex gap-5 text-[11px] uppercase tracking-widest text-neutral-600">
            <span className="text-neutral-900 border-b border-neutral-900 pb-0.5">Search</span>
            <span>Calculator</span><span>Saved</span><span>Dealers</span>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-neutral-500">
          <span>142,118 indexed</span>
          <span className="w-7 h-7 rounded-full bg-amber-900 text-amber-50 flex items-center justify-center text-xs font-semibold">RB</span>
        </div>
      </header>

      {/* Query line — reads like a dateline */}
      <div className="border-b border-neutral-300 bg-neutral-100 px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] font-mono uppercase tracking-wider text-neutral-700">
          <span><span className="text-neutral-500">Make:</span> Ford</span>
          <span><span className="text-neutral-500">Model:</span> Expedition</span>
          <span><span className="text-neutral-500">Near:</span> 07755 Oakhurst NJ</span>
          <span><span className="text-neutral-500">Radius:</span> 100 mi</span>
          <span><span className="text-neutral-500">Features:</span> Captain&apos;s Chairs · Heated</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Section head */}
        <div className="flex items-end justify-between border-b-2 border-neutral-900 pb-3 mb-5">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-amber-900 mb-1">Live listings</div>
            <h1 className="text-3xl md:text-4xl font-semibold" style={serif}>{PREVIEW_VEHICLES.length} vehicles within 100 miles</h1>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 hidden sm:block">Sorted by distance</div>
        </div>

        {/* Trim selector — underlined index tabs */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-6 text-sm">
          {PREVIEW_TRIMS.map((t) => (
            <button key={t} onClick={() => setActiveTrim(t)} className={`pb-0.5 transition ${activeTrim === t ? "text-neutral-900 border-b-2 border-amber-900 font-medium" : "text-neutral-500 hover:text-neutral-900"}`} style={serif}>{t}</button>
          ))}
        </div>

        {/* Listings table */}
        <div className="border-t border-neutral-300">
          {PREVIEW_VEHICLES.map((v) => (
            <button key={v.id} onClick={() => setOpen(v)} className="w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.4fr_1fr_auto] gap-4 items-center px-2 py-4 border-b border-neutral-300 hover:bg-neutral-100 transition group">
              {/* Title block */}
              <div className="flex items-baseline gap-3">
                <span className="text-2xl tabular-nums text-neutral-400 hidden md:inline" style={serif}>{String(PREVIEW_VEHICLES.indexOf(v) + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-lg font-semibold leading-tight" style={serif}>{v.year} {v.make} {v.model} <span className="text-amber-900">{v.trim}</span></div>
                  <div className="text-[12px] font-mono uppercase tracking-wider text-neutral-500 mt-0.5">{v.color} · {v.miles.toLocaleString()} mi {v.cpo && "· Certified"}</div>
                </div>
              </div>
              {/* Dealer + distance */}
              <div className="hidden md:block text-sm text-neutral-700">
                <div>{v.dealer}</div>
                <div className="text-[12px] font-mono uppercase tracking-wider text-neutral-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.dist} mi away</div>
              </div>
              {/* Status */}
              <div className="hidden md:block"><EditorialStatus status={v.status} /></div>
              {/* Price */}
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums" style={serif}>{money(v.price)}</div>
                <span onClick={(e) => { e.stopPropagation(); toggleSaved(v.id); }} className={`text-[11px] font-mono uppercase tracking-wider inline-flex items-center gap-1 mt-1 ${saved.has(v.id) ? "text-amber-900" : "text-neutral-400 group-hover:text-neutral-700"}`}>
                  <Star className="w-3 h-3" fill={saved.has(v.id) ? "currentColor" : "none"} /> {saved.has(v.id) ? "Saved" : "Save"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-neutral-900/40" onClick={() => setOpen(null)} />
          <div className="relative w-full max-w-md h-full overflow-y-auto border-l border-neutral-300" style={{ backgroundColor: "#FAF8F2" }}>
            <div className="sticky top-0 px-6 py-4 border-b border-neutral-300 flex items-center justify-between" style={{ backgroundColor: "#FAF8F2" }}>
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500">Vehicle dossier</span>
              <button onClick={() => setOpen(null)} className="w-8 h-8 rounded-full hover:bg-neutral-200 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <EditorialStatus status={open.status} />
                <h2 className="text-2xl font-semibold mt-2 leading-tight" style={serif}>{open.year} {open.make} {open.model}</h2>
                <div className="text-amber-900 font-medium" style={serif}>{open.trim}</div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-neutral-300 border border-neutral-300">
                <EditorialSpec label="Price" value={money(open.price)} />
                <EditorialSpec label="Mileage" value={`${open.miles.toLocaleString()} mi`} />
                <EditorialSpec label="Exterior" value={open.color} />
                <EditorialSpec label="Distance" value={`${open.dist} mi`} />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 mb-2 border-b border-neutral-300 pb-1">Equipment · from VIN</div>
                <ul className="space-y-1 text-sm">
                  {open.features.map((f) => <li key={f} className="flex items-center gap-2" style={serif}><span className="text-amber-900">—</span> {f}</li>)}
                </ul>
              </div>
              {open.cpo && <div className="flex items-center gap-2 text-sm text-emerald-800"><Award className="w-4 h-4" /> Manufacturer Certified Pre-Owned</div>}
              <div className="flex gap-3 pt-2">
                <button className="flex-1 py-2.5 bg-neutral-900 text-neutral-50 text-sm font-medium hover:bg-neutral-800 transition">Calculate lease</button>
                <button onClick={() => toggleSaved(open.id)} className="px-4 py-2.5 border border-neutral-900 text-sm font-medium hover:bg-neutral-100 transition">{saved.has(open.id) ? "Saved" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditorialStatus({ status }: { status: PreviewVehicle["status"] }) {
  const map = { "In Stock": "In stock", "In Transit": "In transit", "On Order": "On order" };
  return <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-700 border border-neutral-400 px-2 py-0.5">{map[status]}</span>;
}
function EditorialSpec({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#FAF8F2] p-3"><div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{label}</div><div className="text-lg font-semibold tabular-nums" style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}>{value}</div></div>;
}

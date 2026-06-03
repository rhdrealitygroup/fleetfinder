"use client";

import { useState } from "react";
import { Star, MapPin, X, Award, Search, Building2 } from "lucide-react";
import { PREVIEW_VEHICLES, PREVIEW_TRIMS, money, type PreviewVehicle } from "@/lib/previewVehicles";
import { StyleSwitcher } from "../StyleSwitcher";

// AUTOMOTIVE search page — black, orange accent, Bebas condensed caps,
// big bold cards that feel like a performance-car configurator.

const display = { fontFamily: "var(--font-bebas), Impact, sans-serif" };

export default function AutomotiveSearch() {
  const [activeTrim, setActiveTrim] = useState("King Ranch");
  const [open, setOpen] = useState<PreviewVehicle | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set(["2"]));
  const toggleSaved = (id: string) => setSaved((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="min-h-screen bg-black text-neutral-100" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <StyleSwitcher active="automotive" />

      {/* Top bar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/90 backdrop-blur z-30">
        <div className="flex items-center gap-6">
          <div className="text-xl tracking-tight" style={display}>FLEET<span className="text-orange-500">FINDER</span></div>
          <nav className="hidden md:flex items-center gap-5 text-[11px] font-mono uppercase tracking-widest">
            <span className="text-orange-400">Search</span><span className="text-neutral-500">Calculator</span><span className="text-neutral-500">Saved</span><span className="text-neutral-500">Dealers</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-neutral-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> 142,118 live</span>
          <span className="w-8 h-8 bg-orange-500 text-black flex items-center justify-center text-xs font-bold" style={display}>RB</span>
        </div>
      </header>

      <div className="flex">
        {/* Filter rail */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-white/10 p-6 space-y-6 h-[calc(100vh-110px)] sticky top-[110px] overflow-y-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500">── Filters</div>
          <ARow label="Make" value="Ford" />
          <ARow label="Model" value="Expedition" />
          <ARow label="Near" value="07755 · Oakhurst" />
          <ARow label="Radius" value="100 miles" />
          <ARow label="Price" value="$50k – $100k" />
          <ARow label="Year" value="2025 +" />
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-2">Must-have</div>
            <div className="flex flex-wrap gap-1.5">
              {["Capt. Chairs", "Heated", "Tow", "Pano", "360° Cam", "CarPlay"].map((f, i) => (
                <span key={f} className={`px-2 py-1 text-[11px] font-mono uppercase tracking-wide border ${i < 2 ? "bg-orange-500 text-black border-orange-500" : "border-white/15 text-neutral-400"}`}>{f}</span>
              ))}
            </div>
          </div>
          <button className="w-full py-3 bg-orange-500 text-black font-bold tracking-widest text-sm hover:bg-orange-400 transition flex items-center justify-center gap-2" style={display}><Search className="w-4 h-4" /> RUN SEARCH</button>
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 text-center">10 free searches left</div>
        </aside>

        {/* Results */}
        <main className="flex-1 min-w-0 p-6">
          {/* Trim selector — boxed caps */}
          <div className="mb-5">
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500 mb-2">── Trim</div>
            <div className="flex flex-wrap gap-2">
              {PREVIEW_TRIMS.map((t) => (
                <button key={t} onClick={() => setActiveTrim(t)} className={`px-4 py-2 text-sm tracking-widest uppercase transition ${activeTrim === t ? "bg-orange-500 text-black" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`} style={display}>{t}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-5">
            <div className="text-3xl tracking-tight" style={display}>{PREVIEW_VEHICLES.length} <span className="text-neutral-500">RESULTS</span></div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-neutral-500">Sorted: nearest first</div>
          </div>

          {/* Cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            {PREVIEW_VEHICLES.map((v) => (
              <button key={v.id} onClick={() => setOpen(v)} className="text-left bg-neutral-950 border border-white/10 hover:border-orange-500/60 transition group overflow-hidden">
                <div className="relative h-40 flex items-end p-4" style={{ background: `linear-gradient(135deg, hsl(${v.hue} 30% 16%), #050505)` }}>
                  <div className="absolute top-0 right-0 w-1.5 h-full bg-orange-500/70" />
                  <span className="text-5xl tracking-tight text-white/15 absolute top-3 right-4" style={display}>{v.make}</span>
                  <AStatus status={v.status} />
                  {v.cpo && <span className="absolute top-3 left-4 flex items-center gap-1 px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider"><Award className="w-3 h-3" /> CPO</span>}
                  <span onClick={(e) => { e.stopPropagation(); toggleSaved(v.id); }} className={`absolute top-3 right-4 ${saved.has(v.id) ? "text-orange-500" : "text-white/40 hover:text-white"}`}><Star className="w-5 h-5" fill={saved.has(v.id) ? "currentColor" : "none"} /></span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xl leading-none tracking-tight" style={display}>{v.year} {v.make} {v.model}</div>
                      <div className="text-orange-500 text-sm tracking-widest uppercase mt-1" style={display}>{v.trim}</div>
                    </div>
                    <div className="text-2xl tracking-tight tabular-nums" style={display}>{money(v.price)}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-neutral-500">
                    <span>{v.color}</span><span>·</span><span>{v.miles.toLocaleString()} mi</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                    <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5" /> {v.dealer}</span>
                    <span className="flex items-center gap-1 text-orange-400"><MapPin className="w-3.5 h-3.5" /> {v.dist} mi</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>

      {/* Detail panel */}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(null)} />
          <div className="relative w-full max-w-md bg-neutral-950 border-l border-orange-500/40 h-full overflow-y-auto">
            <div className="sticky top-0 bg-neutral-950/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500">Vehicle spec</span>
              <button onClick={() => setOpen(null)} className="w-8 h-8 hover:bg-white/10 flex items-center justify-center text-neutral-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative h-52 flex items-end p-6" style={{ background: `linear-gradient(135deg, hsl(${open.hue} 30% 16%), #050505)` }}>
              <div className="absolute top-0 right-0 w-2 h-full bg-orange-500" />
              <span className="text-7xl tracking-tight text-white/15 absolute top-4 right-6" style={display}>{open.make}</span>
              <div><div className="text-3xl leading-none tracking-tight" style={display}>{open.year} {open.make} {open.model}</div><div className="text-orange-500 tracking-widest uppercase mt-1" style={display}>{open.trim}</div></div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-px bg-white/10 border border-white/10">
                <ASpec label="Price" value={money(open.price)} /><ASpec label="Mileage" value={`${open.miles.toLocaleString()} mi`} /><ASpec label="Exterior" value={open.color} /><ASpec label="Distance" value={`${open.dist} mi`} />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500 mb-3">── Equipment / VIN</div>
                <div className="flex flex-wrap gap-2">{open.features.map((f) => <span key={f} className="px-2 py-1 border border-orange-500/30 text-orange-200 text-[12px] font-mono uppercase tracking-wide">{f}</span>)}</div>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-400 border border-white/10 p-3"><Building2 className="w-4 h-4 text-orange-500" /> {open.dealer} · {open.dist} mi</div>
              <div className="flex gap-2">
                <button className="flex-1 py-3 bg-orange-500 text-black font-bold tracking-widest text-sm hover:bg-orange-400 transition" style={display}>CALCULATE LEASE</button>
                <button onClick={() => toggleSaved(open.id)} className="px-4 py-3 border border-white/20 text-sm font-mono uppercase tracking-widest hover:bg-white/5 transition">{saved.has(open.id) ? "Saved" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ARow({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-1">{label}</div><div className="px-3 py-2 bg-white/5 border border-white/10 text-sm">{value}</div></div>;
}
function AStatus({ status }: { status: PreviewVehicle["status"] }) {
  const map = { "In Stock": "In stock", "In Transit": "In transit", "On Order": "On order" };
  return <span className="relative z-10 text-[10px] font-mono uppercase tracking-widest bg-black/60 text-orange-300 px-2 py-1 border border-orange-500/30">{map[status]}</span>;
}
function ASpec({ label, value }: { label: string; value: string }) {
  return <div className="bg-neutral-950 p-3"><div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">{label}</div><div className="text-2xl tracking-tight tabular-nums mt-1" style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}>{value}</div></div>;
}

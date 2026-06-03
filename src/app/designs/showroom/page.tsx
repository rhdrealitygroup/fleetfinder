import { DesignSwitcher } from "../DesignSwitcher";
import { MockMobileFilters } from "../MockMobileFilters";
import { PREVIEW_VEHICLES, money } from "@/lib/previewVehicles";
import { makeHue } from "@/lib/inventory";

export const metadata = { title: "Design — Showroom" };

// DESIGN 5 — SHOWROOM. Full-width horizontal rows, large imagery, bold
// typography, premium dark. Inspired by luxury auto microsites. One vehicle
// commands the row; feels like a high-end configurator, not a spreadsheet.
export default function Showroom() {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <DesignSwitcher active="showroom" />
      <header className="px-6 py-5 flex items-center justify-between border-b border-neutral-200 bg-white sticky top-0 z-10">
        <div className="text-xl font-black tracking-tight">FLEETFINDER</div>
        <div className="text-sm font-medium text-neutral-500">GMC Sierra EV — Denali — Max Range</div>
        <div className="text-sm px-4 py-2 rounded-full bg-neutral-900 text-white font-medium">Filters</div>
      </header>
      <MockMobileFilters tone="light" />
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-3xl font-black tracking-tight">22 matches<span className="text-neutral-400 font-medium text-lg ml-3">within 100 mi</span></h1>
          <span className="text-sm text-neutral-500">Sorted by distance</span>
        </div>
        {PREVIEW_VEHICLES.map((v, i) => {
          const hue = makeHue(v.make);
          return (
            <div key={v.id} className={`flex flex-col md:flex-row rounded-3xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition ${i % 2 ? "md:flex-row-reverse" : ""}`}>
              <div className="md:w-[44%] h-56 md:h-auto relative flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${hue} 40% 28%), hsl(${hue} 35% 14%))` }}>
                <span className="text-5xl font-black tracking-[0.12em] uppercase text-white/25">{v.make}</span>
                {v.cpo && <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold">CERTIFIED</span>}
              </div>
              <div className="flex-1 p-8 flex flex-col justify-center">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-2">{v.dealer} · {v.dist} mi away</div>
                <div className="text-3xl font-black tracking-tight leading-none">{v.year} {v.make} {v.model}</div>
                <div className="text-lg font-bold text-blue-600 mt-1">{v.trim} · Extended Range</div>
                <div className="flex gap-2 mt-4">{v.features.slice(0, 3).map((f) => <span key={f} className="px-3 py-1 rounded-full bg-neutral-100 text-sm text-neutral-600">{f}</span>)}</div>
                <div className="flex items-center justify-between mt-6">
                  <div><span className="text-3xl font-black tabular-nums">{money(v.price)}</span><span className="text-neutral-400 ml-2">· {v.color}</span></div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-full border border-neutral-300 font-medium text-sm">♡ Save</button>
                    <button className="px-4 py-2 rounded-full bg-neutral-900 text-white font-medium text-sm">View →</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

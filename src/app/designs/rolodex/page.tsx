import { DesignSwitcher } from "../DesignSwitcher";
import { PREVIEW_VEHICLES, money } from "@/lib/previewVehicles";
import { makeHue } from "@/lib/inventory";

export const metadata = { title: "Design — Master-detail" };

// DESIGN 4 — MASTER-DETAIL. Compact result list on the left, a large live
// detail pane on the right. Inspired by email clients / Linear. Fast triage:
// arrow through results, full detail stays in view.
export default function Rolodex() {
  const sel = PREVIEW_VEHICLES[1];
  const hue = makeHue(sel.make);
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col">
      <DesignSwitcher active="rolodex" />
      <header className="px-5 py-3 border-b border-neutral-200 flex items-center gap-4 bg-white">
        <div className="font-bold tracking-tight">FleetFinder</div>
        <div className="text-sm text-neutral-500">GMC Sierra EV · Denali · Max Range — <span className="text-neutral-900 font-medium">22 results</span></div>
        <div className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-neutral-300">Filters</div>
      </header>
      <div className="flex flex-1 min-h-0">
        {/* list */}
        <div className="w-[340px] border-r border-neutral-200 overflow-y-auto bg-white">
          {PREVIEW_VEHICLES.map((v, i) => (
            <div key={v.id} className={`px-4 py-3 border-b border-neutral-100 cursor-pointer ${i === 1 ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-neutral-50"}`}>
              <div className="flex items-center justify-between"><div className="font-semibold text-sm">{v.year} {v.make} {v.model}</div><div className="font-bold text-sm tabular-nums">{money(v.price)}</div></div>
              <div className="text-xs text-blue-600">{v.trim} · Extended Range</div>
              <div className="text-xs text-neutral-500 mt-1 flex justify-between"><span>{v.color}</span><span>{v.dist} mi</span></div>
            </div>
          ))}
        </div>
        {/* detail */}
        <div className="flex-1 overflow-y-auto p-8 hidden md:block">
          <div className="max-w-2xl">
            <div className="h-64 rounded-2xl mb-6 flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${hue} 35% 30%), hsl(${hue} 30% 16%))` }}>
              <span className="text-4xl font-bold tracking-[0.15em] uppercase text-white/70">{sel.make}</span>
            </div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{sel.year} {sel.make} {sel.model}</h1>
                <div className="text-blue-600 font-medium text-lg">{sel.trim} · Extended Range</div>
              </div>
              <div className="text-right"><div className="text-3xl font-bold tabular-nums">{money(sel.price)}</div><div className="text-sm text-neutral-500">~$1,055/mo lease</div></div>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[["Color", sel.color], ["Mileage", `${sel.miles} mi`], ["Distance", `${sel.dist} mi`], ["Status", "In stock"]].map(([k, val]) => (
                <div key={k} className="rounded-xl border border-neutral-200 bg-white p-3"><div className="text-[11px] uppercase text-neutral-400">{k}</div><div className="font-semibold text-sm mt-0.5">{val}</div></div>
              ))}
            </div>
            <div className="text-sm font-semibold mb-2">Equipment</div>
            <div className="flex flex-wrap gap-2 mb-6">{sel.features.map((f) => <span key={f} className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm">{f}</span>)}</div>
            <div className="flex gap-3">
              <button className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium">Calculate lease</button>
              <button className="px-5 py-2.5 rounded-xl border border-neutral-300 font-medium">♡ Save to list</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

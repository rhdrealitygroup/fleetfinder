import { DesignSwitcher } from "../DesignSwitcher";
import { MockMobileFilters } from "../MockMobileFilters";
import { PREVIEW_VEHICLES, money } from "@/lib/previewVehicles";

export const metadata = { title: "Design — Map split" };

// DESIGN 3 — MAP SPLIT. Results list on the left, live map on the right with
// dealer pins. Inspired by Zillow / CarGurus — spatial, "near my customer".
export default function MapSplit() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col">
      <DesignSwitcher active="map" />
      <header className="px-5 py-3 border-b border-neutral-200 flex items-center gap-4">
        <div className="font-bold tracking-tight text-lg">FleetFinder</div>
        <div className="flex-1 max-w-md flex items-center gap-2 bg-neutral-100 rounded-lg px-3 py-2 text-sm text-neutral-500">
          🔍 GMC Sierra EV Denali · Max Range · near 07755
        </div>
        <div className="hidden sm:flex gap-2 text-sm">
          <span className="px-3 py-1.5 rounded-lg border border-neutral-300">Filters</span>
          <span className="px-3 py-1.5 rounded-lg bg-blue-600 text-white">22 results</span>
        </div>
      </header>
      <MockMobileFilters tone="light" />
      <div className="flex flex-1 min-h-0">
        {/* list */}
        <div className="w-full lg:w-[44%] overflow-y-auto border-r border-neutral-200">
          {PREVIEW_VEHICLES.map((v, i) => (
            <div key={v.id} className="flex gap-3 p-3 border-b border-neutral-100 hover:bg-blue-50/50 cursor-pointer">
              <div className="w-28 h-20 rounded-lg bg-gradient-to-br from-neutral-200 to-neutral-300 shrink-0 flex items-center justify-center text-[10px] font-bold text-neutral-500 relative">
                <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">{i + 1}</span>
                {v.make}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between"><div className="font-semibold text-[15px]">{v.year} {v.make} {v.model}</div><div className="font-bold tabular-nums">{money(v.price)}</div></div>
                <div className="text-sm text-blue-600">{v.trim} · Extended Range</div>
                <div className="text-xs text-neutral-500 mt-1">{v.color} · {v.miles.toLocaleString()} mi</div>
                <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1">📍 {v.dealer} · {v.dist} mi</div>
              </div>
            </div>
          ))}
        </div>
        {/* map */}
        <div className="hidden lg:block flex-1 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#e8eef4,#dde6ee)" }}>
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#c2d0dd 1px,transparent 1px),linear-gradient(90deg,#c2d0dd 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
          <div className="absolute inset-0">
            {[[30, 40], [52, 30], [44, 58], [66, 48], [38, 70], [58, 66]].map(([x, y], i) => (
              <div key={i} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%` }}>
                <div className="px-2 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg whitespace-nowrap">{money(PREVIEW_VEHICLES[i].price).replace(",000", "k")}</div>
                <div className="w-2 h-2 bg-blue-600 rotate-45 mx-auto -mt-1" />
              </div>
            ))}
            <div className="absolute left-[48%] top-[50%] -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-emerald-500/30" />
            <div className="absolute left-[48%] top-[50%] translate-y-3 -translate-x-1/2 text-[11px] font-medium text-emerald-700 whitespace-nowrap">Customer · Oakhurst</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { DesignSwitcher } from "../DesignSwitcher";
import { MockMobileFilters } from "../MockMobileFilters";
import { PREVIEW_VEHICLES, PREVIEW_TRIMS, money } from "@/lib/previewVehicles";

export const metadata = { title: "Design — Terminal" };

// DESIGN 1 — TERMINAL. Dense, monospace, data-dense. Inspired by Bloomberg /
// trading terminals. Maximum information density, zero decoration.
export default function Terminal() {
  return (
    <div className="min-h-screen bg-[#0b0e11] text-neutral-200" style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
      <DesignSwitcher active="terminal" />
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-4 text-[11px] uppercase tracking-wider text-neutral-500">
        <span className="text-emerald-400 font-bold">FLEETFINDER</span>
        <span>SEARCH</span><span className="text-neutral-700">CALC</span><span className="text-neutral-700">SAVED</span>
        <span className="ml-auto">142,118 LIVE · 07755 · R100MI</span>
      </div>
      <MockMobileFilters tone="terminal" />
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr]">
        {/* filter rail (desktop) */}
        <div className="hidden lg:block border-r border-white/10 p-3 text-[12px] space-y-3 min-h-[80vh]">
          <Row k="MAKE" v="GMC" />
          <Row k="MODEL" v="Sierra EV" />
          <div>
            <div className="text-neutral-500 text-[10px] mb-1">TRIM</div>
            {PREVIEW_TRIMS.slice(1).map((t, i) => (
              <div key={t} className={`px-1.5 py-0.5 ${i === 1 ? "bg-emerald-500/20 text-emerald-300" : "text-neutral-400"}`}>{t}</div>
            ))}
          </div>
          <div>
            <div className="text-neutral-500 text-[10px] mb-1">DENALI CONFIG</div>
            {["Max Range", "Extended Range", "Standard Range", "Edition 1"].map((v, i) => (
              <div key={v} className={`px-1.5 py-0.5 ${i === 0 ? "bg-emerald-500/20 text-emerald-300" : "text-neutral-400"}`}>{v}</div>
            ))}
          </div>
          <Row k="YEAR" v="2025+" /><Row k="PRICE" v="ANY" />
          <button className="w-full bg-emerald-500 text-black font-bold py-1.5 text-[11px] tracking-wider">RUN ⏎</button>
        </div>
        {/* table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase text-neutral-500 border-b border-white/10">
              <tr>{["", "YEAR", "MODEL / VERSION", "COLOR", "MI", "DEALER", "DIST", "MO", "PRICE"].map((h) => <th key={h} className="text-left px-2 py-1.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {PREVIEW_VEHICLES.concat(PREVIEW_VEHICLES).map((v, i) => (
                <tr key={i} className={`border-b border-white/5 hover:bg-emerald-500/5 ${i % 2 ? "bg-white/[0.015]" : ""}`}>
                  <td className="px-2 py-1.5 text-neutral-600">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-2 py-1.5">{v.year}</td>
                  <td className="px-2 py-1.5 text-neutral-100">{v.model} <span className="text-emerald-400">{v.trim}</span> <span className="text-neutral-500">{v.features[1]?.includes("Range") ? "" : "Ext Range"}</span></td>
                  <td className="px-2 py-1.5 text-neutral-400">{v.color}</td>
                  <td className="px-2 py-1.5 text-right">{v.miles}</td>
                  <td className="px-2 py-1.5 text-neutral-400 truncate max-w-[160px]">{v.dealer}</td>
                  <td className="px-2 py-1.5 text-right text-amber-400">{v.dist}mi</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">${Math.round(v.price / 60)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-300 font-bold">{money(v.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-neutral-500 text-[10px]">{k}</span><span className="text-neutral-200">{v}</span></div>;
}

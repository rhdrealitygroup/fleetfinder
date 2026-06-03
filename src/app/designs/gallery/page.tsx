import { DesignSwitcher } from "../DesignSwitcher";
import { MockMobileFilters } from "../MockMobileFilters";
import { PREVIEW_VEHICLES, money } from "@/lib/previewVehicles";
import { makeHue } from "@/lib/inventory";

export const metadata = { title: "Design — Gallery" };

// DESIGN 2 — GALLERY. Warm, editorial, generous whitespace, big imagery.
// Inspired by Airbnb / high-end real estate listings. Serif headlines.
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

export default function Gallery() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F4EF", color: "#1c1917" }}>
      <DesignSwitcher active="gallery" />
      <MockMobileFilters tone="light" />
      <header className="px-8 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-tight" style={serif}>FleetFinder</div>
        <nav className="hidden sm:flex gap-6 text-sm text-stone-500">
          <span className="text-stone-900 font-medium">Search</span><span>Calculator</span><span>Saved</span>
        </nav>
      </header>
      <div className="max-w-7xl mx-auto px-8 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-amber-700 mb-2">GMC Sierra EV · Denali · Max Range</div>
            <h1 className="text-4xl md:text-5xl" style={serif}>22 vehicles near you</h1>
          </div>
          <div className="hidden md:flex gap-2 text-sm">
            <span className="px-4 py-2 rounded-full bg-stone-900 text-white">Filters</span>
            <span className="px-4 py-2 rounded-full border border-stone-300">Nearest first</span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {PREVIEW_VEHICLES.map((v) => {
            const hue = makeHue(v.make);
            return (
              <div key={v.id} className="group cursor-pointer">
                <div className="relative h-56 rounded-2xl overflow-hidden mb-3 flex items-center justify-center" style={{ background: `linear-gradient(135deg, hsl(${hue} 30% 78%), hsl(${hue} 25% 88%))` }}>
                  <span className="text-3xl font-bold tracking-[0.15em] uppercase" style={{ ...serif, color: `hsl(${hue} 30% 45%)` }}>{v.make}</span>
                  {v.cpo && <span className="absolute top-3 left-3 px-2 py-1 rounded-full bg-white/90 text-[11px] font-medium">Certified</span>}
                  <span className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center text-lg">♡</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg leading-tight" style={serif}>{v.year} {v.make} {v.model}</div>
                    <div className="text-sm text-amber-700">{v.trim}</div>
                  </div>
                  <div className="text-right"><div className="text-lg font-semibold tabular-nums">{money(v.price)}</div></div>
                </div>
                <div className="mt-1.5 text-sm text-stone-500">{v.color} · {v.dealer} · {v.dist} mi away</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

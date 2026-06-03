import Link from "next/link";

export const metadata = { title: "Search page — 5 design directions" };

const D = [
  { slug: "terminal", name: "Terminal", desc: "Dense, monospace, data-first. Bloomberg-terminal energy — max info, zero fluff. Best for power users scanning fast." },
  { slug: "gallery", name: "Gallery", desc: "Warm, serif, big photos, lots of whitespace. Airbnb / luxury real-estate feel. Most approachable for customers looking over your shoulder." },
  { slug: "map", name: "Map split", desc: "Results list + live map with dealer pins. Zillow / CarGurus. Spatial — 'what's near my customer.'" },
  { slug: "rolodex", name: "Master–detail", desc: "Compact list + big detail pane. Email-client / Linear. Fast triage without losing the full picture." },
  { slug: "showroom", name: "Showroom", desc: "Full-width rows, bold type, large imagery. Luxury auto microsite. Premium, one car per row." },
];

export default function DesignsIndex() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 py-14 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-3">FleetFinder · search page</div>
        <h1 className="text-3xl font-bold mb-2">Five directions — pick the feel.</h1>
        <p className="text-neutral-400 mb-8">Same data, five genuinely different layouts (not color swaps). Open each, then tell me a number. I&apos;ll build out the full thing — search + home — in the winner.</p>
        <div className="space-y-3">
          {D.map((d, i) => (
            <Link key={d.slug} href={`/designs/${d.slug}`} className="block rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.05] transition">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-neutral-600 font-mono">{i + 1}</span>
                <h2 className="text-lg font-semibold">{d.name}</h2>
                <span className="ml-auto text-xs font-mono text-neutral-500">open →</span>
              </div>
              <p className="text-sm text-neutral-400 pl-7">{d.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function HomePage() {
  return (
    <div
      className="min-h-screen text-neutral-100"
      style={{
        background:
          "radial-gradient(ellipse 1200px 800px at 50% -10%, rgba(59,130,246,0.15), transparent 60%), #0A0A0A",
      }}
    >
      {/* Nav */}
      <header className="px-6 py-5 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">F</div>
            <div className="font-semibold tracking-tight">FleetFinder</div>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-400">
            <a href="#features" className="hover:text-white transition">Product</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <Link href="/login" className="hover:text-white transition">Sign in</Link>
            <Link href="/signup" className="px-3 py-1.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition">Start free trial</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-20 pb-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live inventory, refreshed continuously
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
              Every dealer.<br />
              <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">One search.</span>
            </h1>
            <p className="text-lg text-neutral-400 leading-relaxed max-w-md mb-8">
              FleetFinder gives leasing agents live inventory across every brand
              their customer might cross-shop — filtered by trim, color, and the
              options that actually close the deal.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Link href="/search" className="px-5 py-2.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition">Try a live search →</Link>
              <Link href="/signup" className="px-5 py-2.5 rounded-md border border-white/15 text-neutral-100 text-sm font-medium hover:bg-white/5 transition">Start 14-day trial</Link>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <div className="flex -space-x-2">
                {["#3B82F6", "#10B981", "#F59E0B", "#EC4899"].map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-neutral-950" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span>Built for leasing offices across NJ &amp; NY</span>
            </div>
          </div>

          {/* Product peek */}
          <div className="relative">
            <div className="absolute -inset-4 bg-blue-500/10 blur-3xl rounded-full" />
            <div className="relative rounded-xl border border-white/10 bg-neutral-900/60 backdrop-blur p-4 shadow-2xl">
              <div className="flex items-center gap-1.5 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="flex-1 ml-3 h-5 rounded bg-neutral-800 px-2 flex items-center text-[10px] text-neutral-500 font-mono">fleetfinder.app/search</div>
              </div>
              <div className="mb-3 flex gap-2">
                <div className="flex-1 h-9 rounded-md bg-neutral-800 px-3 flex items-center text-xs text-neutral-300">Ford Expedition King Ranch · 100 mi of 07755</div>
                <div className="h-9 px-3 rounded-md bg-blue-500 flex items-center text-xs font-medium text-white">Search</div>
              </div>
              {[
                { t: "King Ranch", c: "Agate Black", m: "14 mi", p: "$78,420", d: "George Wall Ford" },
                { t: "Platinum", c: "Star White", m: "22 mi", p: "$81,597", d: "Freehold Ford" },
                { t: "King Ranch", c: "Carbonized Gray", m: "38 mi", p: "$77,540", d: "All American Ford" },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 mb-1.5 rounded-md bg-neutral-800/40 border border-white/5">
                  <div className="w-12 h-9 rounded bg-gradient-to-br from-neutral-700 to-neutral-900 flex-shrink-0 flex items-center justify-center text-[9px] text-neutral-500">🚙</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-neutral-100">2026 Expedition {r.t}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">{r.c} · {r.m} · {r.d}</div>
                  </div>
                  <div className="text-[11px] font-semibold text-neutral-100 font-mono">{r.p}</div>
                </div>
              ))}
              <div className="text-center text-[10px] text-neutral-500 mt-2">+ more results</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">What&apos;s inside</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-14 max-w-2xl">Four tools. Built for how you actually work.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { t: "Live Search", b: "Live inventory from every dealer within 100 miles. Filter by trim, color, packages, distance to your customer." },
              { t: "Lease Calculator", b: "Real money-factor math — rebates, residual, tax. Exact monthly payment in 15 seconds, with your profit shown." },
              { t: "VIN Decode", b: "Paste a VIN, get the factory build sheet — every package, every option, original MSRP." },
              { t: "Customer Profiles", b: "Save a customer's needs for 7 days. Walk back in with a personalized shortlist, not a guess." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition">
                <h3 className="text-lg font-semibold tracking-tight mb-2">{f.t}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">Pricing</div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">Priced for one office. Scales with your bench.</h2>
          <p className="text-neutral-400 mb-12">No setup fees. 14-day free trial. Add or remove agents anytime.</p>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-left max-w-md mx-auto">
            <div className="flex items-baseline gap-2 mb-1"><div className="text-5xl font-semibold tracking-tight">$100</div><div className="text-neutral-500">/mo per company</div></div>
            <div className="text-sm text-neutral-400 mb-6">Owner account · everything included</div>
            <div className="h-px bg-white/10 my-6" />
            <div className="flex items-baseline gap-2 mb-1"><div className="text-3xl font-semibold tracking-tight">+ $15</div><div className="text-neutral-500">/mo per additional agent</div></div>
            <div className="text-sm text-neutral-400 mb-8">Add a few. Add ten. Owner sees everyone&apos;s activity.</div>
            <Link href="/signup" className="block w-full text-center py-2.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition">Start free trial</Link>
          </div>
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <div className="flex items-center gap-2"><div className="w-5 h-5 rounded bg-gradient-to-br from-blue-400 to-blue-600" /><span>FleetFinder · by RHD Reality Group</span></div>
          <div>© 2026 — Oakhurst, NJ</div>
        </div>
      </footer>
    </div>
  );
}

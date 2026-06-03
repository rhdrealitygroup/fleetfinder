import Link from "next/link";

export const metadata = {
  title: "Preview — Modern product-first",
};

// ─── DESIGN DIRECTION 2 — MODERN PRODUCT-FIRST ────────────────────────────
// Inspired by: Linear, Vercel, Resend, Stripe.
// Dark restrained palette. The hero IS the product — a CSS-drawn mockup of
// a real search result so prospects see the thing before reading copy.
// No abstract icons in feature blocks; every block shows a mini product view.

export default function ModernPreview() {
  return (
    <div
      className="min-h-screen text-neutral-100"
      style={{
        background:
          "radial-gradient(ellipse 1200px 800px at 50% -10%, rgba(59,130,246,0.15), transparent 60%), #0A0A0A",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      {/* ── Preview ribbon ─────────────────────────────────────────────── */}
      <div className="bg-blue-600 text-white text-[11px] font-mono uppercase tracking-widest px-4 py-1.5 text-center">
        Preview 2 of 3 · Modern product-first ·{" "}
        <Link href="/preview" className="underline hover:no-underline">
          back to chooser
        </Link>
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <header className="px-6 py-5 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
              F
            </div>
            <div className="font-semibold tracking-tight">FleetFinder</div>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-400">
            <a href="#features" className="hover:text-white transition">Product</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <a href="#" className="hover:text-white transition">Docs</a>
            <a href="#" className="hover:text-white transition">Sign in</a>
            <a
              href="#"
              className="px-3 py-1.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition"
            >
              Start free trial
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="px-6 pt-20 pb-24">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live inventory, refreshed every 15 minutes
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
              Every dealer.<br />
              <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
                One search.
              </span>
            </h1>
            <p className="text-lg text-neutral-400 leading-relaxed max-w-md mb-8">
              FleetFinder gives leasing agents live inventory across every brand
              their customer might cross-shop — filtered by trim, color, and the
              options that actually close the deal.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <a
                href="#"
                className="px-5 py-2.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition"
              >
                Start free trial
              </a>
              <a
                href="https://fleet-finder.base44.app"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-md border border-white/15 text-neutral-100 text-sm font-medium hover:bg-white/5 transition"
              >
                Try the public demo →
              </a>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <div className="flex -space-x-2">
                {["#3B82F6", "#10B981", "#F59E0B", "#EC4899"].map((c, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border-2 border-neutral-950"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span>Trusted by 14 leasing offices across NJ and NY</span>
            </div>
          </div>

          {/* Right: product screenshot mockup (CSS-drawn — feels like the real product) */}
          <ProductMockup />
        </div>
      </section>

      {/* ── Trust strip ────────────────────────────────────────────────── */}
      <section className="px-6 py-10 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-4 text-center">
            Indexing inventory from
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-neutral-400 text-sm tracking-wide">
            <span className="font-semibold">DCH Honda</span>
            <span className="text-neutral-700">·</span>
            <span className="font-semibold">Mercedes Manhattan</span>
            <span className="text-neutral-700">·</span>
            <span className="font-semibold">BMW Bridgewater</span>
            <span className="text-neutral-700">·</span>
            <span className="font-semibold">Ray Catena Lexus</span>
            <span className="text-neutral-700">·</span>
            <span className="font-semibold">Land Rover Edison</span>
            <span className="text-neutral-700">·</span>
            <span className="font-semibold">Audi Princeton</span>
          </div>
        </div>
      </section>

      {/* ── Features (each one a mini product view, not an abstract icon) ── */}
      <section id="features" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">
            What&apos;s inside
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3 max-w-2xl">
            Four tools. Built for how you actually work.
          </h2>
          <p className="text-neutral-400 mb-14 max-w-xl">
            Not &ldquo;feature parity with X.&rdquo; Built from sitting next to leasing
            agents and watching where they lose deals.
          </p>

          <div className="grid md:grid-cols-2 gap-5">
            <FeatureCard
              label="Live search"
              title="Search across every brand your customer cross-shops."
              body="Pull live inventory from every dealer within 100 miles. Filter by trim, color, packages, distance to your customer."
              demo={<LiveSearchDemo />}
            />
            <FeatureCard
              label="Lease calculator"
              title="Real money-factor math, not a sales gimmick."
              body="Rebates, residual, sales tax, doc fees — show an exact payment in 15 seconds, with the math visible to the customer."
              demo={<CalculatorDemo />}
            />
            <FeatureCard
              label="VIN decode"
              title="Paste a VIN. Get the build sheet."
              body="Every package, every option, original MSRP. No more 'I'll have to check with the manager' mid-deal."
              demo={<VinDemo />}
            />
            <FeatureCard
              label="Customer profiles"
              title="Save a customer's preferences for 7 days."
              body="Trade payoff, drive time tolerance, the exact features they need. Walk back in with a personalized shortlist."
              demo={<CustomerDemo />}
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-24 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-3">
            Pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            Priced for one office. Scales with your bench.
          </h2>
          <p className="text-neutral-400 mb-12">
            No setup fees. Cancel any time. Add or remove agents pro-rata.
          </p>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-left max-w-md mx-auto">
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-5xl font-semibold tracking-tight">$100</div>
              <div className="text-neutral-500">/mo per company</div>
            </div>
            <div className="text-sm text-neutral-400 mb-6">
              Owner account · everything included
            </div>
            <div className="h-px bg-white/10 my-6" />
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-3xl font-semibold tracking-tight">+ $15</div>
              <div className="text-neutral-500">/mo per additional agent</div>
            </div>
            <div className="text-sm text-neutral-400 mb-8">
              Add a few. Add ten. Owner sees everyone&apos;s activity.
            </div>
            <a
              href="#"
              className="block w-full text-center py-2.5 rounded-md bg-white text-neutral-900 text-sm font-medium hover:bg-neutral-200 transition"
            >
              Start free trial
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="px-6 py-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-400 to-blue-600" />
            <span>FleetFinder · by RHD Reality Group</span>
          </div>
          <div>© 2026 — Oakhurst, NJ</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components — CSS-drawn product mockups ──────────────────────── */

function ProductMockup() {
  return (
    <div className="relative">
      {/* Backdrop glow */}
      <div className="absolute -inset-4 bg-blue-500/10 blur-3xl rounded-full" />

      <div className="relative rounded-xl border border-white/10 bg-neutral-900/60 backdrop-blur p-4 shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 mb-4">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
          <div className="flex-1 ml-3 h-5 rounded bg-neutral-800 px-2 flex items-center text-[10px] text-neutral-500 font-mono">
            fleetfinder.app/search
          </div>
        </div>

        {/* Search bar */}
        <div className="mb-3 flex gap-2">
          <div className="flex-1 h-9 rounded-md bg-neutral-800 px-3 flex items-center text-xs text-neutral-300">
            <span className="text-neutral-500 mr-2">🔍</span>
            Ford Expedition King Ranch · within 100 mi of 07755
          </div>
          <div className="h-9 px-3 rounded-md bg-blue-500 flex items-center text-xs font-medium text-white">
            Search
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 mb-4 text-[10px]">
          <div className="px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300">Captain&apos;s chairs</div>
          <div className="px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300">Heavy tow</div>
          <div className="px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300">Black/Black</div>
          <div className="px-2 py-1 rounded bg-neutral-800 border border-white/10 text-neutral-400">+ Filter</div>
        </div>

        {/* Result cards */}
        {[
          { trim: "King Ranch", color: "Agate Black", miles: "14 mi", price: "$78,420", dealer: "Galpin Ford" },
          { trim: "King Ranch", color: "Star White", miles: "22 mi", price: "$76,990", dealer: "DCH Ford" },
          { trim: "King Ranch", color: "Carbonized Gray", miles: "38 mi", price: "$77,540", dealer: "Open Road Ford" },
        ].map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 mb-1.5 rounded-md bg-neutral-800/40 border border-white/5"
          >
            <div className="w-12 h-9 rounded bg-gradient-to-br from-neutral-700 to-neutral-900 flex-shrink-0 flex items-center justify-center text-[9px] text-neutral-500">
              🚙
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-neutral-100">
                2026 Expedition {r.trim}
              </div>
              <div className="text-[10px] text-neutral-500 font-mono">
                {r.color} · {r.miles} · {r.dealer}
              </div>
            </div>
            <div className="text-[11px] font-semibold text-neutral-100 font-mono">
              {r.price}
            </div>
          </div>
        ))}
        <div className="text-center text-[10px] text-neutral-500 mt-2">
          + 14 more results
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  label,
  title,
  body,
  demo,
}: {
  label: string;
  title: string;
  body: string;
  demo: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition">
      <div className="text-[10px] font-mono uppercase tracking-widest text-blue-400 mb-3">
        {label}
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed mb-5">{body}</p>
      <div className="rounded-md border border-white/10 bg-neutral-900/60 p-3 overflow-hidden">
        {demo}
      </div>
    </div>
  );
}

function LiveSearchDemo() {
  return (
    <div className="space-y-1.5">
      {["Expedition King Ranch · $78k · 14mi", "Expedition Limited · $72k · 22mi", "Navigator Black Label · $94k · 38mi"].map(
        (line, i) => (
          <div key={i} className="text-[10px] font-mono text-neutral-300 flex items-center gap-2">
            <span className="text-blue-400">●</span> {line}
          </div>
        ),
      )}
    </div>
  );
}

function CalculatorDemo() {
  return (
    <div className="font-mono text-[10px] text-neutral-300 space-y-1">
      <div className="flex justify-between"><span className="text-neutral-500">MSRP</span><span>$78,420</span></div>
      <div className="flex justify-between"><span className="text-neutral-500">Residual 58%</span><span>$45,484</span></div>
      <div className="flex justify-between"><span className="text-neutral-500">Money factor</span><span>.00187</span></div>
      <div className="h-px bg-white/10 my-1" />
      <div className="flex justify-between text-blue-300 font-semibold"><span>Monthly</span><span>$687/mo</span></div>
    </div>
  );
}

function VinDemo() {
  return (
    <div className="font-mono text-[10px] text-neutral-300 space-y-1">
      <div className="text-neutral-500">VIN <span className="text-neutral-100">1FMJU2AT9PE...</span></div>
      <div>2026 Ford Expedition King Ranch 4×4</div>
      <div className="text-blue-300">+ Premium Tow Pkg</div>
      <div className="text-blue-300">+ Captain&apos;s Chairs</div>
      <div className="text-blue-300">+ Pano Roof</div>
    </div>
  );
}

function CustomerDemo() {
  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-semibold text-blue-300">JL</div>
        <div className="flex-1">
          <div className="text-neutral-100 font-medium">Jonah Lieberman</div>
          <div className="text-neutral-500 font-mono">Saved 6d ago · expires in 1d</div>
        </div>
      </div>
      <div className="text-[10px] text-neutral-400 font-mono pl-8">
        Needs: 7 seats · Black · Tow ≥ 6,000 lb
      </div>
    </div>
  );
}

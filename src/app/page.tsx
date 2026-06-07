import Link from "next/link";
import { redirect } from "next/navigation";
import { CompassMark } from "@/components/CompassMark";
import { getSessionContext } from "@/lib/auth";

// Landing — Gallery design: warm cream, serif display, terracotta accent.
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

export default async function HomePage() {
  // Signed-in users never need the marketing page — send them straight to the
  // app. (Middleware also does this; this is a server-side guarantee in case the
  // page is ever served without the middleware redirect, e.g. a cached path.)
  const { user } = await getSessionContext();
  if (user) redirect("/search");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F4EF", color: "#1c1917" }}>
      {/* Nav */}
      <header className="px-6 py-5 max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CompassMark className="w-8 h-8" />
          <div className="text-xl font-bold tracking-tight" style={serif}>LotCompass</div>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-stone-600">
          <a href="#features" className="hover:text-stone-900 transition">Product</a>
          <a href="#pricing" className="hover:text-stone-900 transition">Pricing</a>
          <Link href="/login" className="hover:text-stone-900 transition">Sign in</Link>
          <Link href="/signup" className="px-3 py-1.5 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition">Start free trial</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 pt-16 pb-20 max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#b85c1e] mb-5">For leasing agents who close deals</div>
          <h1 className="text-5xl md:text-6xl leading-[1.05] mb-6" style={serif}>
            Every dealer.<br /><span className="italic text-stone-500">One search.</span>
          </h1>
          <p className="text-lg text-stone-600 leading-relaxed max-w-md mb-8">
            Live inventory across every brand your customer might cross-shop —
            filtered by trim, color, and the options that actually close the deal.
          </p>
          <div className="flex flex-wrap gap-3 mb-10">
            <Link href="/search" className="px-6 py-3 rounded-full bg-[#b85c1e] text-white font-medium hover:bg-[#a44f17] transition">Try a live search →</Link>
            <Link href="/signup" className="px-6 py-3 rounded-full border border-stone-300 text-stone-800 font-medium hover:bg-white transition">Start 14-day trial</Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <div className="flex -space-x-2">
              {["#b85c1e", "#3f6212", "#b45309", "#7c2d12"].map((c, i) => <div key={i} className="w-6 h-6 rounded-full border-2 border-[#F6F4EF]" style={{ backgroundColor: c }} />)}
            </div>
            <span>Built for leasing offices nationwide</span>
          </div>
        </div>

        {/* Product peek */}
        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="rounded-2xl bg-[#F6F4EF] p-3 mb-3 flex items-center gap-2 text-sm text-stone-500">
            🔍 Ford Expedition King Ranch · 100 mi of 07755
          </div>
          {[
            { t: "King Ranch", c: "Agate Black", d: "Galpin Ford", p: "$78,420", h: 28 },
            { t: "Platinum", c: "Star White", d: "Freehold Ford", p: "$81,597", h: 210 },
            { t: "King Ranch", c: "Carbonized Gray", d: "All American Ford", p: "$77,540", h: 28 },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 mb-2 rounded-xl border border-stone-100">
              <div className="w-16 h-12 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, hsl(${r.h} 28% 82%), hsl(${r.h} 24% 90%))` }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">2026 Expedition</div>
                <div className="text-xs text-[#b85c1e]">{r.t} · {r.c}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">{r.p}</div>
            </div>
          ))}
          <div className="text-center text-xs text-stone-400 mt-1">+ more results near your customer</div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 border-t border-stone-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs uppercase tracking-[0.2em] text-[#b85c1e] mb-3">What&apos;s inside</div>
          <h2 className="text-3xl md:text-4xl mb-12 max-w-2xl" style={serif}>Four tools. Built for how you actually work.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { t: "Live Search", b: "Live inventory from every dealer within 100 miles — filtered by trim, color, packages, distance to your customer." },
              { t: "Lease Calculator", b: "Real money-factor math. Exact monthly payment in 15 seconds, with your profit shown." },
              { t: "VIN Decode", b: "Paste a VIN, get the factory build sheet — every package, every option, original MSRP." },
              { t: "Customer Profiles", b: "Save a customer's needs for 7 days. Walk back in with a personalized shortlist." },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border border-stone-200 bg-white p-6">
                <h3 className="text-lg font-semibold mb-2" style={serif}>{f.t}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{f.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 border-t border-stone-200">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-[#b85c1e] mb-3">Pricing</div>
          <h2 className="text-3xl md:text-4xl mb-3" style={serif}>Priced for one office. Scales with your bench.</h2>
          <p className="text-stone-600 mb-10">No setup fees. 14-day free trial. Add or remove agents anytime.</p>
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-left">
            <div className="flex items-baseline gap-2 mb-1"><div className="text-5xl font-semibold tabular-nums" style={serif}>$100</div><div className="text-stone-500">/mo per company</div></div>
            <div className="text-sm text-stone-500 mb-6">Owner account · everything included</div>
            <div className="h-px bg-stone-200 my-6" />
            <div className="flex items-baseline gap-2 mb-1"><div className="text-3xl font-semibold tabular-nums" style={serif}>+ $15</div><div className="text-stone-500">/mo per additional agent</div></div>
            <div className="text-sm text-stone-500 mb-8">Add a few. Add ten. The owner sees everyone&apos;s activity.</div>
            <Link href="/signup" className="block w-full text-center py-3 rounded-full bg-[#b85c1e] text-white font-medium hover:bg-[#a44f17] transition">Start free trial</Link>
          </div>
        </div>
      </section>

      <footer className="px-6 py-10 border-t border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-stone-500">
          <div style={serif} className="font-bold text-stone-800">LotCompass <span className="font-sans font-normal text-stone-500">· by RHD Reality Group</span></div>
          <div>© 2026 LotCompass</div>
        </div>
      </footer>
    </div>
  );
}

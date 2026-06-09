import Link from "next/link";
import { redirect } from "next/navigation";
import { CompassMark } from "@/components/CompassMark";
import { getSessionContext } from "@/lib/auth";
import { Search, ScanLine, HelpCircle, Users, Store, Check, ArrowRight, Gift } from "lucide-react";

// Landing — Gallery design: warm cream, serif display, terracotta accent.
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };
const ACCENT = "#b85c1e";
const CREAM = "#F6F4EF";

export default async function HomePage() {
  // Signed-in users never need the marketing page — send them straight to the
  // app. (Middleware also does this; this is a server-side guarantee in case the
  // page is ever served without the middleware redirect, e.g. a cached path.)
  const { user } = await getSessionContext();
  if (user) redirect("/search");

  const features = [
    { icon: Search, t: "Live Search", b: "Live inventory across every brand and dealer — nationwide or near a ZIP. Filter by trim, color, interior, packages, body, drivetrain, and target monthly payment." },
    { icon: ScanLine, t: "VIN Decode", b: "Paste a VIN, get the factory build sheet — every package, every option, the original MSRP." },
    { icon: HelpCircle, t: "Why-No-Match", b: "When a search comes up empty, it tells you exactly why — and the one-tap change that brings the cars back." },
    { icon: Users, t: "Customer Profiles", b: "Save a customer's needs, star the cars that fit, and build side-by-side compare lists to walk back in with." },
    { icon: Store, t: "Your Dealer Network", b: "Pick the dealers you work with once — your whole team's searches scope to them automatically." },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM, color: "#1c1917" }}>
      {/* Nav */}
      <header className="px-6 py-5 max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CompassMark className="w-8 h-8" />
          <div className="text-xl font-bold tracking-tight" style={serif}>LotCompass</div>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-stone-600">
          <a href="#features" className="hover:text-stone-900 transition">Product</a>
          <a href="#how" className="hover:text-stone-900 transition">How it works</a>
          <a href="#pricing" className="hover:text-stone-900 transition">Pricing</a>
          <Link href="/login" className="hover:text-stone-900 transition">Sign in</Link>
          <Link href="/signup" className="px-3.5 py-1.5 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 transition">Start free trial</Link>
        </nav>
        <Link href="/signup" className="md:hidden px-3.5 py-1.5 rounded-full bg-stone-900 text-white text-sm font-medium">Start free</Link>
      </header>

      {/* Hero */}
      <section className="px-6 pt-14 md:pt-20 pb-20 max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-300/70 bg-white/60 px-3 py-1 text-xs text-stone-600 mb-6">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
            For leasing agents who close deals
          </div>
          <h1 className="text-5xl md:text-[4.2rem] leading-[1.04] mb-6 tracking-[-0.01em]" style={serif}>
            Every dealer.<br /><span className="italic text-stone-500">One search.</span>
          </h1>
          <p className="text-lg text-stone-600 leading-relaxed max-w-md mb-8">
            Search live inventory across every brand and dealer — nationwide, or
            near your customer&apos;s ZIP. Filter by trim, color, interior, packages,
            and target monthly payment to find the exact car that closes the deal.
          </p>
          <div className="flex flex-wrap gap-3 mb-6">
            <Link href="/signup" className="group px-6 py-3 rounded-full text-white font-medium transition inline-flex items-center gap-2" style={{ backgroundColor: ACCENT }}>
              Start your 14-day trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </Link>
            <Link href="/login" className="px-6 py-3 rounded-full border border-stone-300 text-stone-800 font-medium hover:bg-white transition">Sign in</Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-500">
            {["14 days free", "Cancel anytime", "Set up in 2 minutes"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" style={{ color: ACCENT }} /> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Product peek */}
        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-[0_24px_60px_-30px_rgba(28,25,23,0.35)]">
          <div className="rounded-2xl bg-[#F6F4EF] p-3 mb-3 flex items-center gap-2 text-sm text-stone-500">
            <Search className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
            Ford Expedition King Ranch · 100 mi of 07755
          </div>
          {[
            { t: "King Ranch", c: "Agate Black", d: "Galpin Ford", p: "$78,420", h: 28 },
            { t: "Platinum", c: "Star White", d: "Freehold Ford", p: "$81,597", h: 210 },
            { t: "King Ranch", c: "Carbonized Gray", d: "All American Ford", p: "$77,540", h: 28 },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 mb-2 rounded-xl border border-stone-100 hover:border-stone-200 transition">
              <div className="w-16 h-12 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, hsl(${r.h} 28% 82%), hsl(${r.h} 24% 90%))` }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">2026 Expedition</div>
                <div className="text-xs" style={{ color: ACCENT }}>{r.t} · {r.c}</div>
                <div className="text-[11px] text-stone-400 truncate">{r.d}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">{r.p}</div>
            </div>
          ))}
          <div className="text-center text-xs text-stone-400 mt-1">+ more results near your customer</div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="px-6 py-7 border-y border-stone-200 bg-white/40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-x-10 gap-y-2 text-center text-sm text-stone-500">
          <span>Inventory from <span className="text-stone-800 font-medium">40+ brands</span></span>
          <span className="hidden sm:block w-px h-4 bg-stone-300" />
          <span><span className="text-stone-800 font-medium">Nationwide</span> dealer coverage</span>
          <span className="hidden sm:block w-px h-4 bg-stone-300" />
          <span>Live data, <span className="text-stone-800 font-medium">deduped by VIN</span></span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: ACCENT }}>What&apos;s inside</div>
          <h2 className="text-3xl md:text-4xl mb-12 max-w-2xl" style={serif}>Built for how you actually work.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.t} className="rounded-2xl border border-stone-200 bg-white p-6 hover:shadow-[0_18px_40px_-28px_rgba(28,25,23,0.4)] transition">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(184,92,30,0.10)" }}>
                    <Icon className="w-5 h-5" style={{ color: ACCENT }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={serif}>{f.t}</h3>
                  <p className="text-sm text-stone-600 leading-relaxed">{f.b}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 py-20 border-t border-stone-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: ACCENT }}>How it works</div>
          <h2 className="text-3xl md:text-4xl mb-12 max-w-2xl" style={serif}>From customer ask to the right car — fast.</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "Describe the deal", b: "Make, model, trim, color, ZIP, and the monthly payment your customer needs to hit." },
              { n: "02", t: "Search every lot at once", b: "We pull live inventory across brands and dealers, dedupe by VIN, and rank by fit." },
              { n: "03", t: "Walk back in and close", b: "Save the winners to the customer's profile, run the exact lease number, and present." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="text-2xl font-semibold tabular-nums mb-3" style={{ ...serif, color: ACCENT }}>{s.n}</div>
                <h3 className="text-lg font-semibold mb-1.5" style={serif}>{s.t}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 border-t border-stone-200">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-xs uppercase tracking-[0.2em] mb-3" style={{ color: ACCENT }}>Pricing</div>
          <h2 className="text-3xl md:text-4xl mb-3" style={serif}>Priced for one office. Scales with your bench.</h2>
          <p className="text-stone-600 mb-10">No setup fees. 14-day free trial. Add or remove agents anytime.</p>
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-left shadow-[0_24px_60px_-34px_rgba(28,25,23,0.35)]">
            <div className="flex items-baseline gap-2 mb-1"><div className="text-5xl font-semibold tabular-nums" style={serif}>$100</div><div className="text-stone-500">/mo per company</div></div>
            <div className="text-sm text-stone-500 mb-5">Owner account · everything included</div>
            <ul className="space-y-2.5 mb-6">
              {["Unlimited live searches", "Instant VIN decode", "Customer profiles & compare lists", "Your whole dealer network"].map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-stone-700">
                  <Check className="w-4 h-4 shrink-0" style={{ color: ACCENT }} /> {f}
                </li>
              ))}
            </ul>
            <div className="h-px bg-stone-200 my-6" />
            <div className="flex items-baseline gap-2 mb-1"><div className="text-3xl font-semibold tabular-nums" style={serif}>+ $15</div><div className="text-stone-500">/mo per additional agent</div></div>
            <div className="text-sm text-stone-500 mb-8">Add a few. Add ten. The owner sees everyone&apos;s activity.</div>
            <Link href="/signup" className="block w-full text-center py-3 rounded-full text-white font-medium transition" style={{ backgroundColor: ACCENT }}>Start free trial</Link>
            <p className="text-center text-xs text-stone-400 mt-3">$0 today · card starts your trial · cancel before day 14 and pay nothing</p>
          </div>
        </div>
      </section>

      {/* Referral band */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto rounded-3xl border border-stone-200 p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(120deg, rgba(184,92,30,0.08), rgba(184,92,30,0.02))" }}>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(184,92,30,0.12)" }}>
              <Gift className="w-5 h-5" style={{ color: ACCENT }} />
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-1" style={serif}>Give $50, get $50.</h3>
              <p className="text-sm text-stone-600 max-w-md">Know other brokers? Invite them. They get $50 off, you get $50 credit the moment they subscribe.</p>
            </div>
          </div>
          <Link href="/signup" className="shrink-0 px-6 py-3 rounded-full border border-stone-300 bg-white text-stone-800 font-medium hover:bg-stone-50 transition">Get your link</Link>
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

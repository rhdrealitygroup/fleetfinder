import Link from "next/link";

export const metadata = {
  title: "Preview — Automotive direction",
};

// ─── DESIGN DIRECTION 3 — AUTOMOTIVE / INDUSTRIAL ─────────────────────────
// Inspired by: Car & Driver, Motor Trend, dealership advertising, industrial
// catalogs. Brutal caps display type (Bebas Neue), mono details, hot orange
// accent. Full-bleed photographic hero. Risky — could look amazing or like
// a car ad. The point of the preview is to find out which.

const HERO_IMG =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2400&q=80";

export default function AutomotivePreview() {
  return (
    <div
      className="min-h-screen text-neutral-100 bg-black"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      {/* ── Preview ribbon ─────────────────────────────────────────────── */}
      <div className="bg-orange-500 text-black text-[11px] font-mono uppercase tracking-widest px-4 py-1.5 text-center">
        Preview 3 of 3 · Automotive direction ·{" "}
        <Link href="/preview" className="underline hover:no-underline">
          back to chooser
        </Link>
      </div>

      {/* ── Top nav (over hero) ────────────────────────────────────────── */}
      <header className="absolute z-20 top-7 left-0 right-0 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div
            className="text-2xl tracking-tight"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            FLEET<span className="text-orange-500">FINDER</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[11px] font-mono uppercase tracking-widest">
            <a href="#how" className="hover:text-orange-400 transition">How</a>
            <a href="#stats" className="hover:text-orange-400 transition">Coverage</a>
            <a href="#pricing" className="hover:text-orange-400 transition">Pricing</a>
            <a
              href="#"
              className="px-4 py-2 bg-orange-500 text-black font-semibold tracking-widest hover:bg-orange-400 transition"
            >
              Get access
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero — full-bleed photo, brutal caps overlay ───────────────── */}
      <section className="relative h-[88vh] min-h-[640px] overflow-hidden">
        {/* Backdrop image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

        {/* Diagonal accent line */}
        <div className="absolute top-0 right-0 w-2 h-full bg-orange-500" />

        {/* Hero content */}
        <div className="relative h-full flex items-end pb-20 px-6">
          <div className="max-w-6xl mx-auto w-full">
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-400 mb-5">
              ── For leasing agents who close deals
            </div>
            <h1
              className="leading-[0.9] tracking-tight mb-7"
              style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
            >
              <span className="block text-[clamp(72px,12vw,180px)]">EVERY DEALER.</span>
              <span className="block text-[clamp(72px,12vw,180px)] text-orange-500">ONE SEARCH.</span>
            </h1>
            <p className="text-lg text-neutral-300 max-w-xl leading-relaxed mb-9">
              Live inventory across every brand your customer cross-shops.
              Indexed every fifteen minutes. Sorted by what you can deliver
              this week.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#"
                className="px-7 py-4 bg-orange-500 text-black font-bold tracking-widest text-sm hover:bg-orange-400 transition"
              >
                GET ACCESS →
              </a>
              <a
                href="https://fleet-finder.base44.app"
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-4 border border-white/30 text-white font-mono uppercase text-xs tracking-widest hover:border-white hover:bg-white/5 transition"
              >
                Try the demo
              </a>
            </div>
          </div>
        </div>

        {/* Brand marquee at very bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur border-t border-orange-500/50 py-3 overflow-hidden">
          <div className="flex gap-12 text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-400 whitespace-nowrap animate-[marquee_30s_linear_infinite]">
            {[
              "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge","Ford","Genesis","GMC","Honda","Hyundai","Infiniti","Jaguar","Jeep","Kia","Land Rover","Lexus","Lincoln","Maserati","Mazda","Mercedes-Benz","Mini","Mitsubishi","Nissan","Porsche","Ram","Subaru","Tesla","Toyota","Volkswagen","Volvo",
            ].concat([
              "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge","Ford","Genesis","GMC","Honda","Hyundai","Infiniti","Jaguar","Jeep","Kia","Land Rover","Lexus","Lincoln","Maserati","Mazda","Mercedes-Benz","Mini","Mitsubishi","Nissan","Porsche","Ram","Subaru","Tesla","Toyota","Volkswagen","Volvo",
            ]).map((b, i) => (
              <span key={i} className="text-orange-400/70 first:before:content-none before:content-['●'] before:mr-3 before:text-orange-500/40">
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>

      {/* ── Stats grid ─────────────────────────────────────────────────── */}
      <section id="stats" className="px-6 py-24 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500 mb-4">
            ── Coverage
          </div>
          <h2
            className="text-5xl md:text-7xl tracking-tight mb-14 leading-none"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            THE NUMBERS<br />THAT MATTER.
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
            <StatBlock label="Brands indexed" value="47" />
            <StatBlock label="Dealer locations" value="1,184" />
            <StatBlock label="Vehicles live now" value="143K" />
            <StatBlock label="Refresh interval" value="15 MIN" />
          </div>
        </div>
      </section>

      {/* ── How it works (3 brutal blocks) ─────────────────────────────── */}
      <section id="how" className="px-6 py-24 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500 mb-4">
            ── How it works
          </div>
          <h2
            className="text-5xl md:text-7xl tracking-tight mb-14 leading-none"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            FOUR TOOLS.<br />ZERO PHONE TAG.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            <FeatureBlock
              num="01"
              title="LIVE SEARCH"
              body="Every dealer your customer might shop, in one query. Filter by trim, color, option packages, distance to ZIP."
            />
            <FeatureBlock
              num="02"
              title="LEASE CALCULATOR"
              body="Real money-factor math. Residual, rebate, tax. Show the exact monthly payment to the customer in fifteen seconds."
            />
            <FeatureBlock
              num="03"
              title="VIN DECODE"
              body="Paste a VIN. Get the build sheet — every package, every option, original MSRP, factory invoice."
            />
            <FeatureBlock
              num="04"
              title="CUSTOMER PROFILES"
              body="Save what each customer needs for 7 days. Walk back in with a personalized shortlist, not a guess."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-24 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-orange-500 mb-4">
            ── Pricing
          </div>
          <h2
            className="text-5xl md:text-7xl tracking-tight mb-14 leading-none"
            style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
          >
            TWO NUMBERS.<br />NO SURPRISES.
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            <PriceBlock
              label="Per leasing company"
              price="$100"
              unit="/MONTH"
              body="Owner account. Full access — search, calculator, VIN decode, dealer list, customer profiles."
            />
            <PriceBlock
              label="Per additional agent"
              price="$15"
              unit="/MONTH"
              body="Add or remove agents at any time. Pro-rata billing. Owner dashboard tracks every agent."
            />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="#"
              className="px-8 py-4 bg-orange-500 text-black font-bold tracking-widest text-sm hover:bg-orange-400 transition"
            >
              START FREE TRIAL →
            </a>
            <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500">
              No setup fees · Cancel any time · NJ-based support
            </span>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono uppercase tracking-widest text-neutral-500">
          <div>
            <span
              className="text-base text-white tracking-tight mr-3"
              style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
            >
              FLEET<span className="text-orange-500">FINDER</span>
            </span>
            By RHD Reality Group · Oakhurst, NJ
          </div>
          <div>© 2026 · All rights reserved</div>
        </div>
      </footer>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-8">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-3">
        {label}
      </div>
      <div
        className="text-6xl md:text-7xl text-orange-500 leading-none tracking-tight"
        style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}

function FeatureBlock({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-black p-10 hover:bg-neutral-900 transition">
      <div className="flex items-baseline gap-4 mb-4">
        <div
          className="text-4xl text-orange-500 leading-none"
          style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
        >
          {num}
        </div>
        <div
          className="text-3xl text-white leading-none tracking-tight"
          style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
        >
          {title}
        </div>
      </div>
      <p className="text-neutral-400 leading-relaxed text-[15px] max-w-md">{body}</p>
    </div>
  );
}

function PriceBlock({
  label,
  price,
  unit,
  body,
}: {
  label: string;
  price: string;
  unit: string;
  body: string;
}) {
  return (
    <div className="bg-black p-10">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 mb-4">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mb-5">
        <div
          className="text-7xl text-white leading-none tracking-tight"
          style={{ fontFamily: "var(--font-bebas), Impact, sans-serif" }}
        >
          {price}
        </div>
        <div className="text-orange-500 font-mono text-xs tracking-[0.3em]">
          {unit}
        </div>
      </div>
      <p className="text-neutral-400 leading-relaxed text-[15px]">{body}</p>
    </div>
  );
}

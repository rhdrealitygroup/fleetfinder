import Link from "next/link";

export const metadata = {
  title: "Preview — Editorial direction",
};

// ─── DESIGN DIRECTION 1 — EDITORIAL / TRADE JOURNAL ───────────────────────
// Inspired by: NYT, Bloomberg, Financial Times, The Drive (trade pubs).
// Heavy serif (Newsreader), monospace for data, cream background.
// No gradients, no "feature card grid," no AI-template tropes.
// Everything reads like a real piece of trade journalism.

export default function EditorialPreview() {
  return (
    <div
      className="min-h-screen text-neutral-900"
      style={{
        backgroundColor: "#FAF8F2",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      {/* ── Top preview ribbon (so Ray knows which preview he's viewing) ── */}
      <div className="bg-amber-900 text-amber-50 text-[11px] font-mono uppercase tracking-widest px-4 py-1.5 text-center">
        Preview 1 of 3 · Editorial direction ·{" "}
        <Link href="/preview" className="underline hover:no-underline">
          back to chooser
        </Link>
      </div>

      {/* ── Masthead ───────────────────────────────────────────────────── */}
      <header className="border-b border-neutral-300 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <div
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              FleetFinder
            </div>
            <div className="hidden md:block text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Vol. I · No. 1 · June 2026
            </div>
          </div>
          <nav className="flex gap-6 text-xs uppercase tracking-widest text-neutral-700">
            <a href="#how" className="hover:underline">How it works</a>
            <a href="#pricing" className="hover:underline">Pricing</a>
            <a href="#contact" className="hover:underline">Contact</a>
          </nav>
        </div>
      </header>

      {/* ── Stat tape (live data feel) ─────────────────────────────────── */}
      <div className="border-b border-neutral-300 bg-neutral-100 px-6 py-2">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-x-8 gap-y-1 text-[11px] font-mono uppercase tracking-wider text-neutral-700">
          <span><span className="text-neutral-500">Indexed today:</span> 143,892 vehicles</span>
          <span><span className="text-neutral-500">Brands:</span> 47</span>
          <span><span className="text-neutral-500">Dealers:</span> 1,184</span>
          <span><span className="text-neutral-500">Last refresh:</span> 14 min ago</span>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 border-b border-neutral-300">
        <div className="max-w-4xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-amber-900 mb-6">
            For leasing agents who close deals
          </div>
          <h1
            className="text-5xl md:text-7xl leading-[1.05] font-semibold tracking-tight mb-8"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Cross-brand lease inventory,<br />
            <span className="italic font-normal text-neutral-600">one search away.</span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-700 leading-relaxed max-w-2xl">
            Every Honda, Mercedes, Ford and Range Rover within a hundred miles
            of your customer — indexed every fifteen minutes, sorted by what
            you can actually deliver this week.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-900 hover:text-amber-700"
            >
              <span className="border-b border-amber-900 pb-0.5">Request early access</span>
              <span>→</span>
            </Link>
            <a
              href="https://fleet-finder.base44.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              or try the public demo
            </a>
          </div>
        </div>
      </section>

      {/* ── Three-column body (NYT magazine layout) ────────────────────── */}
      <section id="how" className="px-6 py-16 border-b border-neutral-300">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">
            How it works
          </div>
          <h2
            className="text-3xl md:text-4xl font-semibold mb-10 max-w-2xl"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Built around how leasing agents actually shop.
          </h2>

          <div className="grid md:grid-cols-3 gap-10 text-[15px] leading-relaxed text-neutral-800">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-amber-900 mb-2">
                01 · Live search
              </div>
              <p>
                Pull live inventory across every brand a customer might cross-shop.
                Filter by trim, color, and the option packages that matter — heated
                seats, captain&apos;s chairs, the actual towing capacity. Results sort
                by drive time to the customer&apos;s ZIP, not by who paid for placement.
              </p>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-amber-900 mb-2">
                02 · Lease math
              </div>
              <p>
                Real money-factor math with rebates, residual, and tax built in.
                Show the customer their exact monthly payment in fifteen seconds,
                not fifteen minutes of phone tag with the dealer.
              </p>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-amber-900 mb-2">
                03 · VIN decode
              </div>
              <p>
                Paste a VIN, get the build sheet — every package, every option,
                original MSRP, factory invoice. No more &quot;I&apos;ll have to check with
                the manager&quot; mid-deal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pull quote ─────────────────────────────────────────────────── */}
      <section className="px-6 py-20 border-b border-neutral-300 bg-neutral-100">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="text-2xl md:text-3xl leading-snug font-normal italic"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            &ldquo;Used to spend an hour on the phone chasing one Expedition with
            captain&apos;s chairs. Now I find six of them in a minute. My customers
            think I&apos;m a magician.&rdquo;
          </div>
          <div className="mt-6 text-sm font-mono uppercase tracking-widest text-neutral-600">
            — A. Berkowitz · senior leasing agent
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-20 border-b border-neutral-300">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-2">
            Pricing
          </div>
          <h2
            className="text-3xl md:text-4xl font-semibold mb-10"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Two numbers. No surprises.
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-t-2 border-neutral-900 pt-6">
              <div className="text-xs font-mono uppercase tracking-widest text-neutral-600 mb-3">
                Per leasing company
              </div>
              <div
                className="text-6xl font-semibold mb-2"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                $100<span className="text-2xl text-neutral-500 font-normal">/mo</span>
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">
                One owner account. Full access to live search, the calculator,
                VIN decode, your dealer list, and the customer profile vault.
              </p>
            </div>
            <div className="border-t-2 border-neutral-900 pt-6">
              <div className="text-xs font-mono uppercase tracking-widest text-neutral-600 mb-3">
                Per additional agent
              </div>
              <div
                className="text-6xl font-semibold mb-2"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                $15<span className="text-2xl text-neutral-500 font-normal">/mo</span>
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">
                Add or remove agents at any time. Billed pro-rata. The owner sees
                every agent&apos;s activity from one dashboard.
              </p>
            </div>
          </div>
          <div className="mt-10 text-xs font-mono uppercase tracking-widest text-neutral-500">
            No setup fees · Cancel any time · NJ-based support
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer id="contact" className="px-6 py-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-600">
          <div className="font-mono uppercase tracking-widest">
            FleetFinder · A property of RHD Reality Group · Oakhurst, NJ
          </div>
          <div className="font-mono uppercase tracking-widest">
            © 2026 · All rights reserved
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { Search, Zap, Calculator, Building2 } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 bg-gradient-to-b from-background to-muted/30">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          New platform — coming soon
        </div>

        <h1 className="font-heading text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-3xl">
          Cross-brand lease inventory,
          <br />
          one search away.
        </h1>

        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
          Search live new-car inventory across every dealer your leasing customers
          care about. Built for the agents who close deals.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center">
          <button
            disabled
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium opacity-60 cursor-not-allowed"
          >
            Sign up — opens soon
          </button>
          <Link
            href="https://fleet-finder.base44.app"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-secondary transition"
          >
            Try the public demo →
          </Link>
        </div>

        <div className="mt-12 text-xs text-muted-foreground">
          $75/mo per company · $15/mo per additional agent · No setup fees
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-background border-t border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading text-2xl font-semibold text-center mb-12 text-foreground">
            What&apos;s inside
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Search className="w-5 h-5" />}
              title="Live Search"
              body="Search nationwide inventory by make, model, trim, color, features — sorted by distance to your customer."
            />
            <FeatureCard
              icon={<Calculator className="w-5 h-5" />}
              title="Lease Calculator"
              body="Real money-factor math with rebates, tax, and residual — show exact monthly payments to clients in seconds."
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="VIN Decode"
              body="Paste a VIN, get the factory build sheet — every package, every option, the original MSRP."
            />
            <FeatureCard
              icon={<Building2 className="w-5 h-5" />}
              title="Your Dealer List"
              body="Pick the dealers you work with. Every search scopes to your relationships first."
            />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="px-6 py-8 border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div>
            <span className="font-heading font-bold text-foreground">
              FleetFinder
            </span>
            <span className="ml-2">by RHD Reality Group</span>
          </div>
          <div>© {new Date().getFullYear()} — All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-heading font-semibold text-foreground mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

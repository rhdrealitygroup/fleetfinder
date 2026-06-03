import Link from "next/link";

export const metadata = {
  title: "Design previews — pick a direction",
};

const directions = [
  {
    slug: "editorial",
    name: "Editorial / Trade Journal",
    tagline: "Like NYT, Bloomberg, or a serious B2B publication.",
    body: "Heavy serif headlines, dense data layout, monospace details. Feels expensive, intentional, like a real industry publication — not a SaaS template.",
    palette: ["#FAFAF7", "#1A1A1A", "#9A3412"],
  },
  {
    slug: "modern",
    name: "Modern product-first",
    tagline: "Like Linear, Vercel, Resend.",
    body: "Dark, restrained. The hero IS a real screenshot of the search UI, not abstract icons. Feels like a shipped SaaS that ships fast.",
    palette: ["#0A0A0A", "#FAFAFA", "#3B82F6"],
  },
  {
    slug: "automotive",
    name: "Automotive / Industrial",
    tagline: "Borrows from car media and dealership advertising.",
    body: "Full-bleed photo hero, brutal caps headlines, condensed display type, racing-stripe accents. Most distinct category-fit — but the riskiest.",
    palette: ["#000000", "#F5F5F5", "#FF6B00"],
  },
];

export default function PreviewIndex() {
  return (
    <main className="min-h-screen bg-neutral-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-neutral-500 mb-3">
          FleetFinder · landing-page direction
        </div>
        <h1 className="font-heading text-3xl font-bold text-neutral-900 mb-2">
          Three directions. Open each on your phone.
        </h1>
        <p className="text-neutral-600 mb-10 max-w-xl">
          Same content (headline, pricing, features) — three different visual
          languages. Pick the one you want me to build out for real, or tell me
          what to fix on the closest one.
        </p>

        <div className="space-y-4">
          {directions.map((d) => (
            <Link
              key={d.slug}
              href={`/preview/${d.slug}`}
              className="block rounded-xl border border-neutral-200 bg-white p-6 hover:border-neutral-400 hover:shadow-md transition group"
            >
              <div className="flex items-center justify-between gap-4 mb-2">
                <h2 className="font-heading text-xl font-semibold text-neutral-900">
                  {d.name}
                </h2>
                <div className="flex gap-1.5">
                  {d.palette.map((c) => (
                    <span
                      key={c}
                      className="w-5 h-5 rounded-full border border-neutral-200"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-sm text-neutral-500 italic mb-2">{d.tagline}</div>
              <p className="text-sm text-neutral-700 leading-relaxed">{d.body}</p>
              <div className="mt-4 text-xs font-mono uppercase tracking-wider text-neutral-400 group-hover:text-neutral-700 transition">
                Open preview →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-xs text-neutral-500">
          Reply to me in chat with &ldquo;1&rdquo;, &ldquo;2&rdquo;, or &ldquo;3&rdquo; — or describe what&apos;s right
          and what&apos;s off about the closest one.
        </div>
      </div>
    </main>
  );
}

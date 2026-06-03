import Link from "next/link";

const STYLES = [
  { slug: "terminal", label: "Terminal" },
  { slug: "gallery", label: "Gallery" },
  { slug: "map", label: "Map split" },
  { slug: "rolodex", label: "Master–detail" },
  { slug: "showroom", label: "Showroom" },
];

export function DesignSwitcher({ active }: { active: string }) {
  return (
    <div className="bg-neutral-900 text-white px-4 py-2 flex items-center gap-3 text-xs overflow-x-auto">
      <span className="font-mono uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:inline">Design:</span>
      <div className="flex items-center gap-1 shrink-0">
        {STYLES.map((s) => (
          <Link key={s.slug} href={`/designs/${s.slug}`}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition ${active === s.slug ? "bg-white text-neutral-900 font-medium" : "bg-white/10 text-neutral-300 hover:bg-white/20"}`}>
            {s.label}
          </Link>
        ))}
      </div>
      <Link href="/designs" className="font-mono uppercase tracking-widest text-neutral-500 hover:text-white ml-auto shrink-0">all ↗</Link>
    </div>
  );
}

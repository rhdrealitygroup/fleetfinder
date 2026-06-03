import Link from "next/link";
import { SEARCH_STYLES } from "@/lib/previewVehicles";

// Sticky bar at the very top of every styled search preview. Lets Ray flip
// between the three design languages applied to the actual product.
export function StyleSwitcher({ active }: { active: string }) {
  return (
    <div className="bg-neutral-900 text-white px-4 py-2 flex items-center justify-center gap-3 text-xs">
      <span className="font-mono uppercase tracking-widest text-neutral-400 hidden sm:inline">
        Search page · style:
      </span>
      <div className="flex items-center gap-1">
        {SEARCH_STYLES.map((s) => (
          <Link
            key={s.slug}
            href={`/preview/search/${s.slug}`}
            className={`px-3 py-1 rounded-full transition ${
              active === s.slug
                ? "bg-white text-neutral-900 font-medium"
                : "bg-white/10 text-neutral-300 hover:bg-white/20"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
      <Link
        href="/preview"
        className="font-mono uppercase tracking-widest text-neutral-500 hover:text-white ml-2"
      >
        ← all previews
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompassMark } from "@/components/CompassMark";

// Top navigation shared across the authenticated app pages (Modern look).
const LINKS = [
  { href: "/search", label: "Live Search" },
  { href: "/calculator", label: "Calculator" },
  { href: "/saved", label: "Saved" },
  { href: "/dealers", label: "Dealers" },
  { href: "/team", label: "Team" },
  { href: "/billing", label: "Billing" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border px-5 py-3 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur z-30">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <CompassMark className="w-8 h-8" />
          <span className="font-heading font-bold tracking-tight text-lg">LotCompass</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-6 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md transition ${
                  active ? "bg-white/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/billing"
          className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-semibold text-primary hover:bg-primary/30 transition"
          title="Account & billing"
        >
          RB
        </Link>
      </div>
    </header>
  );
}

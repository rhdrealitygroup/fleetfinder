"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CompassMark } from "@/components/CompassMark";
import { createClient } from "@/lib/supabase/client";

// Initials of the signed-in user (full name → first letters, else email first
// char). Replaces the hardcoded "RB" placeholder so every agent sees their own.
function useUserInitials() {
  const [initials, setInitials] = useState("");
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser().then(({ data }) => {
      const u = data.user;
      if (cancelled || !u) return;
      const name = String((u.user_metadata as Record<string, unknown>)?.full_name || "").trim();
      const ini = name
        ? name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
        : (u.email?.[0] || "?").toUpperCase();
      setInitials(ini);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return initials;
}

// Top navigation shared across the authenticated app pages (Modern look).
const LINKS = [
  { href: "/search", label: "Live Search" },
  { href: "/calculator", label: "Calculator" },
  { href: "/saved", label: "Saved" },
  { href: "/customers", label: "Customers" },
  { href: "/dealers", label: "Dealers" },
  { href: "/team", label: "Team" },
  { href: "/billing", label: "Billing" },
];

export function AppNav() {
  const pathname = usePathname();
  const initials = useUserInitials();
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
          {initials || <span className="w-3.5 h-3.5 rounded-full bg-primary/40" />}
        </Link>
      </div>
    </header>
  );
}

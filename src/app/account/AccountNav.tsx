"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Left sub-menu for the Account hub. Horizontal scroll on mobile, vertical on md+.
const ITEMS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/company", label: "Company" },
  { href: "/account/billing", label: "Billing" },
  { href: "/account/team", label: "Agents" },
  { href: "/account/dealers", label: "Dealers" },
  { href: "/account/referrals", label: "Refer & Earn" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:sticky md:top-20 -mx-1 px-1">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href}
            className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
              active ? "bg-white/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

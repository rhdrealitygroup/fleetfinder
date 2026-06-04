// GET /api/dealers/catalog — searchable NY/NJ dealer directory.
// Reads the prebuilt catalog (pulled from MarketCheck) and filters by query /
// state / type / make, sorted by inventory size. A dealer's `makes` is the set
// of new-car brands they're franchised for, so a multi-make dealer matches each.

import { NextResponse } from "next/server";
import dealersData from "@/data/dealers-nynj.json";

type Dealer = {
  id: string; name: string; street: string; city: string; state: string; zip: string;
  phone: string; type: string; group: string; website: string; listing_count: number;
  makes?: string[]; lat: string | number; lng: string | number;
};

const ALL = (dealersData as Dealer[]).slice().sort((a, b) => (b.listing_count || 0) - (a.listing_count || 0));
const PER = 40;
// All new-car makes present in the directory (for the make filter dropdown).
const MAKES = Array.from(new Set(ALL.flatMap((d) => d.makes || []))).sort();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const state = (searchParams.get("state") || "").toUpperCase();
  const type = (searchParams.get("type") || "").toLowerCase();
  const make = searchParams.get("make") || "";
  const page = Math.max(0, Number(searchParams.get("page")) || 0);

  let list = ALL;
  if (state === "NJ" || state === "NY") list = list.filter((d) => d.state === state);
  if (type === "franchise" || type === "independent") list = list.filter((d) => d.type === type);
  if (make) list = list.filter((d) => (d.makes || []).includes(make));
  if (q) list = list.filter((d) =>
    d.name.toLowerCase().includes(q) ||
    d.city.toLowerCase().includes(q) ||
    (d.group || "").toLowerCase().includes(q) ||
    d.zip.includes(q),
  );

  const total = list.length;
  const items = list.slice(page * PER, page * PER + PER);
  return NextResponse.json({
    total, page, per: PER, items, makes: MAKES,
    counts: { all: ALL.length, nj: ALL.filter((d) => d.state === "NJ").length, ny: ALL.filter((d) => d.state === "NY").length },
  });
}

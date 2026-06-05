// GET /api/dealers/catalog — searchable dealer directory.
// Serves from the nationwide Supabase `dealer_catalog` table once it's
// populated; falls back to the bundled NJ/NY file until then. Filters by
// query / state / type / make, sorted by name.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_MAKES } from "@/lib/carCatalog";
import dealersData from "@/data/dealers-nynj.json";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Dealer = {
  id: string; name: string; street: string; city: string; state: string; zip: string;
  phone: string; type: string; group: string; website: string; listing_count: number;
  makes?: string[]; lat: string | number; lng: string | number;
};

const PER = 40;
const MAKES = [...CATALOG_MAKES].sort((a, b) => a.localeCompare(b));

// ── Static fallback (NJ/NY file) ──
const FILE = (dealersData as Dealer[]).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
function fromFile(q: string, state: string, type: string, make: string, page: number) {
  let list = FILE;
  if (state) list = list.filter((d) => d.state === state);
  if (type) list = list.filter((d) => d.type === type);
  if (make) list = list.filter((d) => (d.makes || []).includes(make));
  if (q) list = list.filter((d) => d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q) || (d.group || "").toLowerCase().includes(q) || d.zip.includes(q));
  const total = list.length;
  return { total, page, per: PER, items: list.slice(page * PER, page * PER + PER), makes: MAKES, counts: { all: FILE.length, nj: FILE.filter((d) => d.state === "NJ").length, ny: FILE.filter((d) => d.state === "NY").length }, source: "file" };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const state = (searchParams.get("state") || "").toUpperCase();
  const type = (searchParams.get("type") || "").toLowerCase();
  const make = searchParams.get("make") || "";
  const page = Math.max(0, Number(searchParams.get("page")) || 0);

  try {
    const supabase = await createClient();
    // Is the nationwide table populated?
    const head = await supabase.from("dealer_catalog").select("id", { count: "exact", head: true });
    if (head.error || !head.count) return NextResponse.json(fromFile(q, state, type, make, page));

    let query = supabase.from("dealer_catalog").select("id,name,street,city,state,zip,phone,type,dealer_group,website,listing_count,makes", { count: "exact" });
    if (state) query = query.eq("state", state);
    if (type) query = query.eq("type", type);
    if (make) query = query.contains("makes", [make]);
    if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,zip.ilike.%${q}%,dealer_group.ilike.%${q}%`);
    query = query.order("name").range(page * PER, page * PER + PER - 1);
    const { data, count, error } = await query;
    if (error) return NextResponse.json(fromFile(q, state, type, make, page));

    const items = (data || []).map((d: any) => ({ ...d, group: d.dealer_group || "" }));
    return NextResponse.json({ total: count || 0, page, per: PER, items, makes: MAKES, counts: { all: head.count }, source: "db" });
  } catch {
    return NextResponse.json(fromFile(q, state, type, make, page));
  }
}

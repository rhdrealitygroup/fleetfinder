// GET /api/dealers/catalog — searchable dealer directory.
// Serves from the nationwide Supabase `dealer_catalog` table once it's
// populated; falls back to the bundled NJ/NY file until then. Filters by
// query / state / type / make, sorted by name.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
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
// Sort stocked dealers first (listing_count desc), then by name — so a dealer with
// inventory is never buried under alphabetical 0-inventory rows.
const byStockThenName = (a: Dealer, b: Dealer) =>
  (Number(b.listing_count) || 0) - (Number(a.listing_count) || 0) || (a.name || "").localeCompare(b.name || "");
const FILE = (dealersData as Dealer[]).slice().sort(byStockThenName);
function fromFile(q: string, state: string, type: string, make: string, page: number) {
  let list = FILE;
  if (state) list = list.filter((d) => d.state === state);
  if (type) list = list.filter((d) => d.type === type);
  // Inclusive make filter: most file rows have no makes tags, so don't hide them.
  if (make) list = list.filter((d) => !(d.makes && d.makes.length) || d.makes.includes(make));
  if (q) list = list.filter((d) => d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q) || (d.group || "").toLowerCase().includes(q) || d.zip.includes(q));
  const total = list.length;
  return { total, page, per: PER, items: list.slice(page * PER, page * PER + PER), makes: MAKES, counts: { all: FILE.length, nj: FILE.filter((d) => d.state === "NJ").length, ny: FILE.filter((d) => d.state === "NY").length }, source: "file" };
}

export async function GET(req: Request) {
  // Defense-in-depth: require a session in-handler, not just the proxy gate.
  const { user } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    if (make) {
      // Most dealers have NO make tags (only ~20% are tagged), so a strict
      // `makes @> {make}` hid ~78% of the directory whenever a make was picked —
      // the "list is incomplete" symptom. Include untagged dealers (null or empty
      // makes) alongside the tagged matches so the filter narrows without hiding.
      // Sanitize to letters/digits/space/&/- so the value can't break out of the
      // PostgREST .or() filter (injection guard).
      const safeMake = make.replace(/[^a-zA-Z0-9 &-]/g, "").trim();
      if (safeMake) query = query.or(`makes.cs.{"${safeMake}"},makes.is.null,makes.eq.{}`);
    }
    if (q) {
    // Strip PostgREST filter metacharacters so a query like "a,id.eq.x" can't
    // break out of the intended ilike clauses (filter injection).
    const safe = q.replace(/[,()*\\"]/g, " ").replace(/\s+/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%,zip.ilike.%${safe}%,dealer_group.ilike.%${safe}%`);
  }
    // Stocked dealers first so an empty result is obviously the dealer's own empty
    // inventory, not a buried list — then alphabetical within equal counts.
    query = query.order("listing_count", { ascending: false }).order("name").range(page * PER, page * PER + PER - 1);
    const { data, count, error } = await query;
    if (error) return NextResponse.json(fromFile(q, state, type, make, page));

    // Strip the "—" sentinel (means "probed, sells no new makes") from display.
    const items = (data || []).map((d: any) => ({
      ...d, group: d.dealer_group || "",
      makes: Array.isArray(d.makes) ? d.makes.filter((m: string) => m && m !== "—") : d.makes,
    }));
    return NextResponse.json({ total: count || 0, page, per: PER, items, makes: MAKES, counts: { all: head.count }, source: "db" });
  } catch {
    return NextResponse.json(fromFile(q, state, type, make, page));
  }
}

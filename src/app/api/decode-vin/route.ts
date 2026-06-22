// POST /api/decode-vin — VIN → factory build sheet via MarketCheck NeoVIN,
// with a basic-decode fallback. The decode + its caching live in
// lib/marketcheck#decodeVinBuildSheet, which caches the build sheet DURABLY in
// vin_decode_cache (so a cold start doesn't re-charge the $0.08 NeoVIN call) and
// primes the search slice from the same decode (so a VIN that's both viewed and
// option-searched is charged once — BUG-0023).

import { NextResponse } from "next/server";
import { requireActivePlan } from "@/lib/auth";
import { decodeVinBuildSheet } from "@/lib/marketcheck";

export async function POST(req: Request) {
  const gate = await requireActivePlan();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  const vin = String(body.vin || "").toUpperCase().trim();
  if (vin.length !== 17) return NextResponse.json({ error: "VIN must be 17 characters" }, { status: 400 });

  const out = await decodeVinBuildSheet(vin, !!body.fresh);
  if (out.error || !out.data) {
    return NextResponse.json({ vin, packages: [], options: [], error: out.error || "decode failed" }, { status: out.status || 502 });
  }
  return NextResponse.json({ ...out.data, cached: out.cached, provider: out.provider });
}

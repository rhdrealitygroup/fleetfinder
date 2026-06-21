// Per-COMPANY dealer selection (shared across the org's agents).
//   GET                       → the org's saved dealers
//   POST   { dealer:{id,...} } → add one
//   DELETE { id }             → remove one
// Stored in public.dealers (dealer_key = MarketCheck dealer id).

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function resolveOrg() {
  const { user, membership } = await getSessionContext();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  let org = membership?.org_id;
  let role = membership?.role as string | undefined;
  if (!org) { const ensured = await ensureOrgForUser(); org = ensured?.org_id; role = ensured?.role; }
  if (!org) return { error: "No organization" as const, status: 400 };
  return { org, role };
}

export async function GET() {
  const ctx = await resolveOrg();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error, dealers: [] }, { status: ctx.status });
  const supabase = await createClient();
  // Only currently-selected dealers (treat legacy null as selected).
  const { data } = await supabase
    .from("dealers").select("dealer_key,name,city,state")
    .eq("org_id", ctx.org)
    .or("selected.is.null,selected.eq.true");
  const dealers = (data || []).filter((d) => d.dealer_key).map((d) => ({ id: d.dealer_key, name: d.name, city: d.city, state: d.state }));
  return NextResponse.json({ dealers });
}

export async function POST(req: Request) {
  // Any member (including agents) can ADD a dealer to the company list.
  const ctx = await resolveOrg();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const d = body.dealer || {};
  const id = String(d.id || "").trim();
  if (!id) return NextResponse.json({ error: "dealer id required" }, { status: 400 });
  const db = createServiceRoleClient();
  const { data: existing } = await db.from("dealers").select("id").eq("org_id", ctx.org).eq("dealer_key", id).limit(1);
  if (!existing?.length) {
    await db.from("dealers").insert({
      org_id: ctx.org, dealer_key: id, name: d.name || "", city: d.city || "", state: d.state || "", selected: true,
    });
  } else {
    // Re-selecting a previously deselected dealer.
    await db.from("dealers").update({ selected: true }).eq("org_id", ctx.org).eq("dealer_key", id);
  }
  // Register the dealer for the dump pipeline now (fast), then kick an immediate
  // best-effort dump WITHOUT blocking the response — a slow/large dealer must not
  // hang the "add dealer" click. The 6h cron backfills if this gets cut short.
  try {
    await db.from("tracked_dealers").upsert(
      { dealer_id: id, name: d.name || null, city: d.city || null, state: d.state || null },
      { onConflict: "dealer_id", ignoreDuplicates: true },
    );
  } catch { /* cron's syncTrackedDealers will register it */ }
  // COST-STOP: the immediate on-select inventory dump is PAUSED, matching the
  // paused dump-inventory cron. dumpDealerListings pages /search/car/active with
  // dealer_id, which returns a COUNT but no listings under our entitlement — so it
  // spent MarketCheck quota writing nothing into the (currently unread) `inventory`
  // table. The dealer is still registered in tracked_dealers above, so when
  // auto-desking ships you can restore this by re-enabling the dump via `after()`
  // AND routing it through /dealerships/inventory (the endpoint that actually
  // returns per-dealer listings). See lib/inventoryDump.ts.
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await resolveOrg();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!["owner", "admin"].includes(ctx.role || "")) return NextResponse.json({ error: "Only an owner or admin can change the company dealer list" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Soft-deselect (set selected=false) rather than hard-delete, so the row's
  // metadata survives and selection state stays a clean boolean.
  await createServiceRoleClient().from("dealers").update({ selected: false }).eq("org_id", ctx.org).eq("dealer_key", id);
  return NextResponse.json({ ok: true });
}

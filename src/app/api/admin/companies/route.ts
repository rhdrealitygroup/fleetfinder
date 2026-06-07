// Super-admin company controls. Platform-admin only.
//   PATCH { id, comped }                 → set/unset free access
//   PATCH { id, monthlyPriceOverride }   → custom $/mo (null clears → standard)

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function PATCH(req: Request) {
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (typeof b.comped === "boolean") patch.comped = b.comped;
  if ("monthlyPriceOverride" in b) {
    const v = b.monthlyPriceOverride;
    if (v === null || v === "") {
      patch.monthly_price_override = null;
      patch.stripe_custom_price_id = null; // back to standard price
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
      patch.monthly_price_override = Math.round(n);
      patch.stripe_custom_price_id = null; // amount changed → force a fresh Stripe price at next checkout
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const db = createServiceRoleClient();
  const { error } = await db.from("organizations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, id, ...patch });
}

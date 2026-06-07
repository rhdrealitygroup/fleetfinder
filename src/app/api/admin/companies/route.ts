// Super-admin company controls. Currently: toggle "comped" (complimentary free
// access) — a company that bypasses Stripe payment entirely but uses the normal
// app (no admin powers). Platform-admin only.
//   PATCH { id, comped }  → set/unset free access for a company

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const { user, isSuperAdmin } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (typeof b.comped !== "boolean") return NextResponse.json({ error: "comped (boolean) required" }, { status: 400 });

  const db = createServiceRoleClient();
  const { error } = await db.from("organizations").update({ comped: b.comped }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, id, comped: b.comped });
}

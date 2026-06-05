// POST /api/bypass  { code }
// Access-code login: if the code matches BYPASS_CODE (server env, NOT in the
// repo), sign the visitor into a single sandboxed guest account. This is a real
// Supabase session (so RLS + the gated APIs all keep working), but it's an
// isolated guest org — bypass users never touch real companies' data. The guest
// password is derived server-side from the code + service-role key, so it's not
// guessable and never appears in the codebase. Disable anytime by clearing the
// BYPASS_CODE env var.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const GUEST_EMAIL = "guest@lotcompass.app";

export async function POST(req: Request) {
  const expected = process.env.BYPASS_CODE;
  if (!expected) return NextResponse.json({ error: "Access code not enabled" }, { status: 403 });

  const { code } = await req.json().catch(() => ({}));
  if (String(code || "").trim() !== expected) {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  // Deterministic, server-only guest password (never stored in the repo).
  const password = crypto
    .createHash("sha256")
    .update(`lc-guest:${expected}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`)
    .digest("hex");

  const supabase = await createClient();
  let { error } = await supabase.auth.signInWithPassword({ email: GUEST_EMAIL, password });

  if (error) {
    // First use (or guest doesn't exist yet) — provision it, then retry.
    const admin = createServiceRoleClient();
    await admin.auth.admin
      .createUser({ email: GUEST_EMAIL, password, email_confirm: true, user_metadata: { company_name: "Guest (demo)", full_name: "Guest" } })
      .catch(() => null);
    ({ error } = await supabase.auth.signInWithPassword({ email: GUEST_EMAIL, password }));
  }

  if (error) return NextResponse.json({ error: "Could not start guest session" }, { status: 401 });
  return NextResponse.json({ ok: true });
}

// GET /api/referral/resolve?code=ABC123 — public, returns just the referring
// company's name so the signup page can show "X invited you". No auth (the
// visitor isn't signed in yet); leaks only a company display name by code.
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase();
  if (!code) return NextResponse.json({ company: null });
  const db = createServiceRoleClient();
  const { data } = await db.from("organizations").select("name").eq("referral_code", code).maybeSingle();
  const name = data?.name && !/'s company$/.test(data.name as string) ? (data.name as string) : null;
  return NextResponse.json({ company: name });
}

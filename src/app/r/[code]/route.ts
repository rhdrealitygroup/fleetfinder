// GET /r/:code — referral landing link. Drops a 30-day cookie with the referral
// code (survives the signup/OAuth round-trip) and forwards to signup with the
// code in the query so the welcome banner can show.
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = (code || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase();
  const url = new URL("/signup", req.url);
  if (clean) url.searchParams.set("ref", clean);
  const res = NextResponse.redirect(url);
  if (clean) res.cookies.set("lc_ref", clean, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  return res;
}

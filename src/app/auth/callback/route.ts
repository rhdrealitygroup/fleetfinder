import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the auth code (magic link / email confirmation / OAuth) for a
// session, then redirects to ?next (default /search).
// Only allow same-site relative redirects. Reject protocol-relative ("//host")
// and backslash ("/\\host") values that browsers resolve to an external origin —
// otherwise ?next becomes an open-redirect / phishing vector.
function safeNext(raw: string | null): string {
  const n = raw || "/search";
  if (!n.startsWith("/") || n.startsWith("//") || n.startsWith("/\\")) return "/search";
  return n;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

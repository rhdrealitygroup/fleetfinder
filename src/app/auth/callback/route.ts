import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the auth code (magic link / email confirmation / OAuth) for a
// session, then redirects to ?next (default /search).
// Only allow same-site relative redirects. Strict allowlist (not a denylist):
// the value must be a single leading "/" followed by a non-slash/non-backslash
// char, then no backslashes or whitespace/control chars anywhere. This blocks
// "//host", "/\\host", and tab/newline tricks like "/\t//host" that some
// browsers normalize back into a protocol-relative URL (open-redirect/phishing).
function safeNext(raw: string | null): string {
  const n = raw || "/search";
  return /^\/[^/\\\s][^\\\s]*$/.test(n) ? n : "/search";
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

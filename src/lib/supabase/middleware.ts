import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session cookie on every request and guards the
// app: the whole product requires sign-in. Wired from src/proxy.ts.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If Supabase isn't configured yet, don't block anything.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // The whole app requires sign-in. Public = marketing home + auth routes +
  // the Stripe webhook (server-to-server, no session). Everything else is gated.
  const publicPrefixes = ["/login", "/signup", "/auth", "/api/stripe/webhook"];
  const isPublic = path === "/" || publicPrefixes.some((p) => path.startsWith(p));

  // Signed-out visitor hitting a protected page → send to /login, remembering
  // where they were headed so the callback returns them there.
  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  // Already signed in but on /login or /signup → bounce into the app.
  if (user && (path === "/login" || path === "/signup")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/search";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

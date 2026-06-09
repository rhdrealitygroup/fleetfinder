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

  // getUser() makes a network call to the auth server. A transient failure must
  // NOT throw out of the proxy — the matcher runs on nearly every route, so an
  // uncaught error would 500 the whole site, including /login. Fail open and let
  // page-level getSessionContext (which also try/catches) handle gating.
  let user = null;
  try {
    const res = await supabase.auth.getUser();
    user = res.data.user;
  } catch {
    return response;
  }

  const path = request.nextUrl.pathname;

  // getUser() can rotate the refresh token; Supabase wrote the new auth cookies
  // onto `response` via setAll. A bare NextResponse.redirect() would DROP those
  // Set-Cookie headers, so the browser keeps the now-consumed old token → the next
  // request fails to refresh and the user is spuriously logged out. Copy the
  // rotated cookies onto every redirect we return.
  const redirectTo = (to: URL) => {
    const res = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // The whole app requires sign-in. Public = marketing home + auth routes +
  // the Stripe webhook (server-to-server, no session). Everything else is gated.
  const publicPrefixes = ["/login", "/signup", "/auth", "/api/stripe/webhook", "/api/cron", "/r/", "/api/referral"];
  const isPublic = path === "/" || publicPrefixes.some((p) => path.startsWith(p));

  // Signed-out visitor hitting a protected page → send to /login, remembering
  // where they were headed so the callback returns them there.
  if (!user && !isPublic) {
    // API routes should answer with 401 JSON, not a 302 to an HTML login page —
    // a fetch() can't follow that meaningfully and ends up parsing HTML as JSON.
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return redirectTo(redirect);
  }

  if (user) {
    // Has the user finished first-run setup (name + company)? The flag is set on
    // the auth user's metadata by /api/account/onboard. getUser() returns current
    // metadata from the auth server, so this reflects completion immediately
    // after onboarding.
    // Super-admins (platform owners) are never forced through company onboarding —
    // they operate above orgs. Inline the email check to avoid importing the heavy
    // auth module (which pulls next/headers) into the proxy.
    const isSuper = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      .includes((user.email || "").toLowerCase());
    const onboarded = isSuper || !!(user.user_metadata as Record<string, unknown> | undefined)?.onboarded;

    // Entry points (marketing / auth pages): funnel a signed-in user to setup if
    // they haven't onboarded, otherwise straight into the app.
    if (path === "/" || path === "/login" || path === "/signup") {
      const redirect = request.nextUrl.clone();
      redirect.pathname = onboarded ? "/search" : "/onboarding";
      redirect.search = "";
      return redirectTo(redirect);
    }

    // Force first-run setup before any app PAGE is usable. Never touch /api/*
    // (the onboarding form POSTs to /api/account/onboard and the nav reads
    // /api/me), /auth/*, or /onboarding itself — that would deadlock setup.
    if (
      !onboarded &&
      path !== "/onboarding" &&
      !path.startsWith("/api") &&
      !path.startsWith("/auth")
    ) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/onboarding";
      redirect.search = "";
      return redirectTo(redirect);
    }
  }

  return response;
}

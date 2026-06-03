// Server-side Supabase client. Use this in Server Components, Route Handlers,
// and Server Actions. Handles cookies for SSR auth.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Setting cookies fails inside Server Components — Next.js
            // calls setAll from a Server Action / Route Handler. Ignore here.
          }
        },
      },
    },
  );
}

// Service-role client — bypasses RLS, only use in backend code that's
// already verified the caller's identity. Reads SUPABASE_SERVICE_ROLE_KEY
// (server-only env var, NEVER expose to browser).
import { createClient as createBaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

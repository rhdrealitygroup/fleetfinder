// Browser-side Supabase client. Use this in Client Components and React hooks.
// Reads NEXT_PUBLIC_* env vars (safe to expose to the browser — Supabase's
// anon key is designed for public use; Row-Level Security is what protects
// the data).
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

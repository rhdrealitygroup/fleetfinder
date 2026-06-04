"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Loader2, Mail } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/search";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else router.push(next);
  }

  async function signInMagic(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-heading text-2xl font-bold mb-1">Welcome back</h1>
      <p className="text-sm text-muted-foreground mb-6">Sign in to LotCompas.</p>

      <GoogleSignInButton next={next} />
      <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>

      {sent ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm flex items-start gap-3">
          <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>Check your email — we sent a sign-in link to <span className="font-medium">{email}</span>.</div>
        </div>
      ) : (
        <form onSubmit={mode === "password" ? signInPassword : signInMagic} className="space-y-3">
          <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {mode === "password" && (
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "password" ? "Sign in" : "Send magic link"}
          </button>
          <button type="button" onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(""); }} className="w-full text-xs text-muted-foreground hover:text-foreground">
            {mode === "password" ? "Email me a magic link instead" : "Use a password instead"}
          </button>
        </form>
      )}

      <div className="mt-6 text-sm text-muted-foreground">
        New here? <Link href="/signup" className="text-primary hover:underline">Start a free trial</Link>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

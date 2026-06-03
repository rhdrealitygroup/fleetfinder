"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Loader2, Mail } from "lucide-react";

export default function SignupPage() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
        data: { full_name: name, company_name: company },
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-1">Start your free trial</h1>
        <p className="text-sm text-muted-foreground mb-6">14 days free · no card required · $100/mo after.</p>

        <GoogleSignInButton next="/onboarding" />
        <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or sign up with email <div className="h-px flex-1 bg-border" />
        </div>

        {done ? (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm flex items-start gap-3">
            <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>Almost there — check <span className="font-medium">{email}</span> and click the confirmation link to finish setup.</div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input required placeholder="Leasing company name" value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
            <input required placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            {error && <div className="text-sm text-destructive">{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create account
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50";

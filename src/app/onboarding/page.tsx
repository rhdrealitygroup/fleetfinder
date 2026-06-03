import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { getSessionContext } from "@/lib/auth";
import { CheckCircle2 } from "lucide-react";

// Landed here after email confirmation. Org creation + agent setup gets wired
// in the accounts phase; for now confirm the account and route into the app.
export default async function OnboardingPage() {
  const { user } = await getSessionContext();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-lg mx-auto p-5 pt-16 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-positive" />
        <h1 className="font-heading text-2xl font-bold mb-1">You&apos;re in{user?.email ? `, ${user.email}` : ""}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Your 14-day trial is active. Live Search and the Lease Calculator are ready to use now —
          company billing and adding agents come next.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/search" className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition">Start searching</Link>
          <Link href="/calculator" className="px-5 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm font-medium transition">Open calculator</Link>
        </div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

/* eslint-disable @typescript-eslint/no-explicit-any */

// First-run setup. Collects the user's name + company and creates/names their
// org via /api/account/onboard. Pre-fills from signup metadata or an existing
// (auto-provisioned) org so the user just confirms.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  let fullName = (user.user_metadata?.full_name as string) || "";
  let company = (user.user_metadata?.company_name as string) || "";

  // If an org/membership already exists (e.g. auto-provisioned), prefer its real
  // values — but ignore the auto-generated "<name>'s company" placeholder.
  const db = createServiceRoleClient();
  const { data: mems } = await db
    .from("memberships").select("org_id, first_name, last_name")
    .eq("user_id", user.id).order("created_at", { ascending: true }).limit(1);
  if (mems && mems[0]) {
    const nm = [mems[0].first_name, mems[0].last_name].filter(Boolean).join(" ");
    if (!fullName && nm) fullName = nm;
    const { data: org } = await db.from("organizations").select("name").eq("id", mems[0].org_id).maybeSingle();
    if (!company && org?.name && !/'s company$/.test(org.name as string)) company = org.name as string;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-md mx-auto p-5 pt-16">
        <h1 className="font-heading text-2xl font-bold mb-1">Set up your account</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your <span className="text-foreground font-medium">14-day free trial</span> starts now — no card required. Just confirm a couple details.
        </p>
        <OnboardingForm initialFullName={fullName} initialCompany={company} />
      </main>
    </div>
  );
}

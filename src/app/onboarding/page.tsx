import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { OnboardingPayment } from "./OnboardingPayment";

/* eslint-disable @typescript-eslint/no-explicit-any */

// First-run setup. Two steps for an owner: (1) name + company, then (2) the card
// gate — they add a card to start the 14-day trial before entering the app.
// Invited agents do step 1 only (the owner's subscription covers them).
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const onboarded = !!meta.onboarded;
  const profileComplete = !!meta.profile_complete;
  const justPaid = sp?.checkout === "success";
  const justCancelled = sp?.checkout === "cancelled";

  // Fully set up already (and not mid-finalize) → into the app.
  if (onboarded && !justPaid) redirect("/search");

  let fullName = (meta.full_name as string) || "";
  let company = (meta.company_name as string) || "";
  let isAgent = false;
  let isOwner = false;
  let joiningCompany = "";
  let comped = false;
  let hasSub = false;

  // Prefer real membership/org values (e.g. auto-provisioned or invited agent),
  // ignoring the auto-generated "<name>'s company" placeholder.
  const db = createServiceRoleClient();
  const { data: mems } = await db
    .from("memberships").select("org_id, role, first_name, last_name")
    .eq("user_id", user.id).order("created_at", { ascending: true }).limit(1);
  if (mems && mems[0]) {
    isAgent = mems[0].role !== "owner";
    isOwner = mems[0].role === "owner";
    const nm = [mems[0].first_name, mems[0].last_name].filter(Boolean).join(" ");
    if (!fullName && nm) fullName = nm;
    const { data: org } = await db.from("organizations").select("name, comped, stripe_subscription_id").eq("id", mems[0].org_id).maybeSingle();
    joiningCompany = (org?.name as string) || "";
    if (!company && org?.name && !/'s company$/.test(org.name as string)) company = org.name as string;
    comped = !!org?.comped;
    hasSub = !!org?.stripe_subscription_id;
  }

  const billingOn = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_BASE;
  const ownerNeedsCard = isOwner && billingOn && !comped && !hasSub;

  // Step routing. finalize: just returned from Checkout, OR a sub/comp already
  // exists but the gate flag hasn't flipped (recovery). payment: owner finished
  // the profile step and still needs a card. Otherwise: the name/company form.
  const showFinalize = justPaid || (isOwner && (hasSub || comped) && !onboarded);
  const showPayment = !showFinalize && profileComplete && ownerNeedsCard;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-md mx-auto p-5 pt-16">
        {showFinalize ? (
          <>
            <h1 className="font-heading text-2xl font-bold mb-1">Starting your trial</h1>
            <p className="text-sm text-muted-foreground mb-6">Hang tight — we&apos;re getting your account ready.</p>
            <OnboardingPayment mode="finalize" />
          </>
        ) : showPayment ? (
          <>
            <h1 className="font-heading text-2xl font-bold mb-1">Start your free trial</h1>
            <p className="text-sm text-muted-foreground mb-6">
              One last step{company ? <> for <span className="text-foreground font-medium">{company}</span></> : ""} — add a card to start your <span className="text-foreground font-medium">14-day free trial</span>.
            </p>
            <OnboardingPayment mode={justCancelled ? "cancelled" : "payment"} />
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-bold mb-1">{isAgent ? "Welcome — finish your profile" : "Set up your account"}</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {isAgent
                ? <>You&apos;ve been added to <span className="text-foreground font-medium">{joiningCompany || "your company"}</span>. Just tell us your name to get started.</>
                : <>Tell us about your company. Next, you&apos;ll add a card to start your <span className="text-foreground font-medium">14-day free trial</span> — you won&apos;t be charged today.</>}
            </p>
            <OnboardingForm initialFullName={fullName} initialCompany={company} isAgent={isAgent} joiningCompany={joiningCompany} />
          </>
        )}
      </main>
    </div>
  );
}

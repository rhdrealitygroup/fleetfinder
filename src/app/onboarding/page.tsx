import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CompassMark } from "@/components/CompassMark";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { OnboardingPayment } from "./OnboardingPayment";
import { CalendarClock, Ban, ShieldCheck, Check } from "lucide-react";

 

// First-run setup. Two guided steps for an owner: (1) name + company, then (2) the
// card gate — add a card to start the 14-day trial before entering the app.
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

  if (onboarded && !justPaid) redirect("/search");

  let fullName = (meta.full_name as string) || "";
  let company = (meta.company_name as string) || "";
  let isAgent = false;
  let isOwner = false;
  let joiningCompany = "";
  let comped = false;
  let hasSub = false;

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

  const showFinalize = justPaid || (isOwner && (hasSub || comped) && !onboarded);
  const showPayment = !showFinalize && profileComplete && ownerNeedsCard;

  // Steps for the indicator. Agents (and comped/dev owners with no card step) get a
  // single step; owners get the two-step trial flow.
  const twoStep = !isAgent && billingOn;
  const stepIndex = showPayment || showFinalize ? 1 : 0; // 0 = details, 1 = trial
  const steps = twoStep ? ["Your details", "Start your trial"] : ["Your details"];

  // Right-column header copy per state.
  const heading = showFinalize ? "Starting your trial"
    : showPayment ? "Add your card"
    : isAgent ? "Finish your profile"
    : "Tell us about your company";
  const sub = showFinalize ? "Hang tight — we're getting your account ready."
    : showPayment ? "You won't be charged today. This starts your 14-day free trial."
    : isAgent ? <>You&apos;ve been added to <span className="text-foreground font-medium">{joiningCompany || "your company"}</span>. Just confirm your name.</>
    : "We'll use this to set up your workspace. Next, you'll start your free trial.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto px-5 py-10 md:py-16 grid lg:grid-cols-[0.85fr_1fr] gap-8 lg:gap-14 items-start">
        {/* Left: guidance panel */}
        <aside className="lg:sticky lg:top-16">
          <div className="flex items-center gap-2 mb-6">
            <CompassMark className="w-7 h-7" />
            <span className="font-heading text-lg font-bold">LotCompass</span>
          </div>
          <h2 className="font-heading text-2xl font-bold mb-1">{isAgent ? "Welcome aboard" : "Welcome — let's get you set up"}</h2>
          <p className="text-sm text-muted-foreground mb-7">
            {isAgent ? "One quick step and you're in." : "Two quick steps and you're searching live inventory."}
          </p>

          {/* Stepper */}
          <ol className="space-y-3 mb-8">
            {steps.map((label, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${done ? "bg-positive text-white" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={`text-sm ${current ? "text-foreground font-medium" : done ? "text-muted-foreground" : "text-muted-foreground"}`}>{label}</span>
                </li>
              );
            })}
          </ol>

          {/* Reassurance — owners only (the trial/card story) */}
          {!isAgent && billingOn && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {[
                { icon: CalendarClock, t: "14 days free", b: "No charge today — your card just starts the trial." },
                { icon: Ban, t: "Cancel anytime", b: "Cancel before day 14 and you pay nothing." },
                { icon: ShieldCheck, t: "Secure by Stripe", b: "Card details go straight to Stripe — we never see them." },
              ].map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.t} className="flex items-start gap-3">
                    <Icon className="w-[18px] h-[18px] text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[13px] font-medium leading-tight">{r.t}</div>
                      <div className="text-[12px] text-muted-foreground">{r.b}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right: the active step */}
        <div className="w-full max-w-md">
          <h1 className="font-heading text-2xl font-bold mb-1">{heading}</h1>
          <p className="text-sm text-muted-foreground mb-6">{sub}</p>
          {showFinalize ? (
            <OnboardingPayment mode="finalize" />
          ) : showPayment ? (
            <OnboardingPayment mode={justCancelled ? "cancelled" : "payment"} />
          ) : (
            <OnboardingForm initialFullName={fullName} initialCompany={company} isAgent={isAgent} joiningCompany={joiningCompany} />
          )}
        </div>
      </main>
    </div>
  );
}

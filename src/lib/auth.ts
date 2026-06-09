import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// Super-admins are platform owners (RHD), identified by email via env.
// They operate above all organizations.
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

export type Role = "owner" | "admin" | "agent";

export type SessionContext = {
  user: { id: string; email: string | null } | null;
  isSuperAdmin: boolean;
  membership: { org_id: string; role: Role } | null;
};

// Resolve the current user + their primary membership + super-admin status.
// Returns nulls (never throws) when Supabase isn't configured or signed out.
export async function getSessionContext(): Promise<SessionContext> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, isSuperAdmin: false, membership: null };

    const isSuperAdmin = isSuperAdminEmail(user.email);

    // Resolve the caller's OWN membership with the service-role client. The
    // RLS-scoped read of `memberships` was returning nothing for the owning
    // user (the members_read policy routes through my_org_ids(), which reads
    // memberships — so a user couldn't see their own row), which made every
    // org-scoped feature think the user had no org: billing/team/checkout
    // returned "Unauthorized" and ensureOrgForUser kept creating duplicate orgs.
    // We've already verified identity via auth.getUser(); scoping the lookup to
    // this user's id keeps it safe.
    const { data: memberships } = await createServiceRoleClient()
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }) // deterministic primary org
      .limit(1);

    const membership = memberships && memberships[0]
      ? { org_id: memberships[0].org_id as string, role: memberships[0].role as Role }
      : null;

    return {
      user: { id: user.id, email: user.email ?? null },
      isSuperAdmin,
      membership,
    };
  } catch {
    return { user: null, isSuperAdmin: false, membership: null };
  }
}

export type PlanGate = { ok: boolean; status: number; error?: string; ctx: SessionContext };

// Server-side subscription enforcement for paid, quota-spending routes
// (live-search, diagnose, list-*). Without this a canceled/past-due org or an
// expired free trial could keep hitting MarketCheck for free — the billing UI
// alone is not a control. Rules:
//   • signed out                       → 401
//   • super-admin                      → allowed (platform owner)
//   • no org yet (pre-onboarding)      → allowed (implicit fresh trial)
//   • plan_status active               → allowed
//   • plan_status trial, not expired   → allowed
//   • trial expired / past_due / canceled → 402 (must fix billing)
// Fails OPEN on a transient DB read error so a blip never blocks a paying agent;
// only a definitive inactive status returns 402.
export async function requireActivePlan(): Promise<PlanGate> {
  const ctx = await getSessionContext();
  if (!ctx.user) return { ok: false, status: 401, error: "Unauthorized", ctx };
  if (ctx.isSuperAdmin) return { ok: true, status: 200, ctx };

  // Determine the org. A signed-in user with NO membership (signed up but never
  // onboarded) must NOT get unlimited free paid access — provision their trial
  // org so a real trial clock starts and is then enforced below.
  let orgId = ctx.membership?.org_id;
  if (!orgId) {
    const { ensureOrgForUser } = await import("@/lib/account");
    const ensured = await ensureOrgForUser();
    // Couldn't provision → treat as TRANSIENT and ask the caller to retry. Do NOT
    // fail OPEN to free metered (MarketCheck) access — that's a cost leak if the
    // failure persists.
    if (!ensured) return { ok: false, status: 503, error: "Setting up your account — please try again in a moment.", ctx };
    orgId = ensured.org_id;
  }
  try {
    // Read with the service-role client (identity already verified above) so an
    // RLS edge case can't make a definitively-canceled org "fail open" into free
    // paid-quota access. select("*") is resilient to the comped column not yet
    // existing in older DBs.
    const db = createServiceRoleClient();
    const { data: org } = await db
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .single();
    if (!org) return { ok: true, status: 200, ctx }; // truly unreadable → don't hard-block
    if (org.comped) return { ok: true, status: 200, ctx }; // complimentary free access (set by a super-admin)
    const status = String(org.plan_status || "");
    const trialOk = status === "trial" && (!org.trial_ends_at || Date.parse(org.trial_ends_at as string) > Date.now());
    // 'incomplete' is the transient post-checkout state before the first payment
    // confirms (Stripe auto-expires it within ~23h). Grant grace access rather than
    // hard-blocking a customer who just paid while the charge settles.
    if (status === "active" || status === "incomplete" || trialOk) return { ok: true, status: 200, ctx };
    const error = status === "trial"
      ? "Your free trial has ended — add a payment method to keep searching."
      : "Your subscription is inactive. Update billing to continue.";
    return { ok: false, status: 402, error, ctx };
  } catch {
    return { ok: true, status: 200, ctx }; // transient error → fail open
  }
}

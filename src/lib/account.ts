import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// Ensures the signed-in user has an organization + owner membership. Called on
// onboarding and anywhere we need a guaranteed org context. Uses the service
// role to create rows (bypasses RLS) after verifying the caller's identity.
export async function ensureOrgForUser(opts?: { companyName?: string; fullName?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createServiceRoleClient();

  // Already a member of an org? Check with the service-role client — the
  // RLS-scoped read hides the user's own membership row, so a user-scoped check
  // here would always miss and create a duplicate org on every call.
  const { data: existing } = await db
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true }) // deterministic primary org
    .limit(1);
  if (existing && existing[0]) return { org_id: existing[0].org_id as string, role: existing[0].role as string };

  const companyName =
    opts?.companyName ||
    (user.user_metadata?.company_name as string) ||
    (user.email ? `${user.email.split("@")[0]}'s company` : "My company");

  // Set the trial end explicitly (don't rely solely on the column default) so a
  // trial can always be enforced.
  const trialEnds = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

  let orgId: string;
  const { data: org } = await db
    .from("organizations")
    .insert({ name: companyName, owner_id: user.id, agent_limit: 1, plan_status: "trial", trial_ends_at: trialEnds })
    .select("id")
    .single();
  if (org) {
    orgId = org.id as string;
  } else {
    // Insert failed — almost always the owner-unique constraint tripping because
    // a concurrent first-load already created this user's org. Fall back to that
    // existing org instead of creating a duplicate (the old duplicate-org bug).
    const { data: existingOrg } = await db
      .from("organizations").select("id").eq("owner_id", user.id)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!existingOrg) return null;
    orgId = existingOrg.id as string;
  }

  const fullName = opts?.fullName || (user.user_metadata?.full_name as string) || "";
  const [first, ...rest] = fullName.split(" ");
  // Idempotent: (org_id, user_id) is unique, so a racing duplicate is a no-op.
  await db.from("memberships").upsert({
    org_id: orgId,
    user_id: user.id,
    role: "owner",
    first_name: first || null,
    last_name: rest.join(" ") || null,
    email: user.email,
  }, { onConflict: "org_id,user_id", ignoreDuplicates: true });

  return { org_id: orgId, role: "owner" as const };
}

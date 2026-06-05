import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// Ensures the signed-in user has an organization + owner membership. Called on
// onboarding and anywhere we need a guaranteed org context. Uses the service
// role to create rows (bypasses RLS) after verifying the caller's identity.
export async function ensureOrgForUser(opts?: { companyName?: string; fullName?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Already a member of an org?
  const { data: existing } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true }) // deterministic primary org
    .limit(1);
  if (existing && existing[0]) return { org_id: existing[0].org_id as string, role: existing[0].role as string };

  const db = createServiceRoleClient();
  const companyName =
    opts?.companyName ||
    (user.user_metadata?.company_name as string) ||
    (user.email ? `${user.email.split("@")[0]}'s company` : "My company");

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({ name: companyName, owner_id: user.id, agent_limit: 1, plan_status: "trial" })
    .select("id")
    .single();
  if (orgErr || !org) return null;

  const fullName = opts?.fullName || (user.user_metadata?.full_name as string) || "";
  const [first, ...rest] = fullName.split(" ");
  await db.from("memberships").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
    first_name: first || null,
    last_name: rest.join(" ") || null,
    email: user.email,
  });

  return { org_id: org.id as string, role: "owner" as const };
}

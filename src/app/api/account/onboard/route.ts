// POST /api/account/onboard — first-run setup. Creates (or names) the user's
// org from the entered company name and sets their full name. Works for any
// signup path (email or Google), so org naming never depends on the signup form.

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const companyName = String(b.companyName || "").trim();
  const fullName = String(b.fullName || "").trim();
  // An invited agent already belongs to a company they didn't create — they only
  // confirm their own name; company is neither asked for nor required.
  const isInvitedAgent = !!membership && membership.role !== "owner";
  if (!fullName) return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  if (!isInvitedAgent && !companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  // Creates the org (named from companyName) if none exists, else returns it. For
  // an agent we pass no companyName so their existing org is never renamed/created.
  const ensured = await ensureOrgForUser(isInvitedAgent ? { fullName } : { companyName, fullName });
  if (!ensured) return NextResponse.json({ error: "Couldn't set up your account — try again." }, { status: 500 });

  const db = createServiceRoleClient();
  const [first, ...rest] = fullName.split(" ");
  // Always set the caller's own name (covers the case where the org already
  // existed — e.g. auto-provisioned — so ensureOrgForUser didn't set it). Check
  // the result: don't mark onboarding complete on a failed write, or the user
  // ends up "set up" with a missing name / un-renamed company.
  const { error: memErr } = await db.from("memberships").update({ first_name: first || null, last_name: rest.join(" ") || null })
    .eq("org_id", ensured.org_id).eq("user_id", user.id);
  if (memErr) return NextResponse.json({ error: "Couldn't finish setup — please try again." }, { status: 500 });
  // profiles is a best-effort mirror (auth metadata is the source of truth for name).
  await db.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  // Only the OWNER may (re)name the company — an invited agent must not rename
  // their company's org.
  if (ensured.role === "owner" && companyName) {
    const { error: orgErr } = await db.from("organizations").update({ name: companyName }).eq("id", ensured.org_id);
    if (orgErr) return NextResponse.json({ error: "Couldn't finish setup — please try again." }, { status: 500 });
  }

  // Mark first-run setup complete on the auth user's metadata. The middleware
  // reads this flag to stop funnelling the user back to /onboarding. (Supabase
  // merges these keys into existing user_metadata rather than replacing it.)
  const { error: metaErr } = await db.auth.admin.updateUserById(user.id, {
    user_metadata: { full_name: fullName, ...(companyName ? { company_name: companyName } : {}), onboarded: true },
  });
  // The middleware gates the whole app on this flag. If the write fails we MUST
  // NOT report success — otherwise the client navigates to /search and the gate
  // bounces it straight back to /onboarding on every page (a hard loop). Let the
  // user retry (org creation above is idempotent).
  if (metaErr) return NextResponse.json({ error: "Couldn't finish setup — please try again." }, { status: 500 });

  return NextResponse.json({ ok: true });
}

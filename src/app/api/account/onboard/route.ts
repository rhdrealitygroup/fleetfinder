// POST /api/account/onboard — first-run setup. Creates (or names) the user's
// org from the entered company name and sets their full name. Works for any
// signup path (email or Google), so org naming never depends on the signup form.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const { data: memRows, error: memErr } = await db.from("memberships").update({ first_name: first || null, last_name: rest.join(" ") || null })
    .eq("org_id", ensured.org_id).eq("user_id", user.id).select("id");
  // Refuse to mark onboarding complete if the membership write errored OR matched
  // zero rows (membership missing) — otherwise the gate flag would be set on a
  // half-provisioned account.
  if (memErr || !memRows || memRows.length === 0) return NextResponse.json({ error: "Couldn't finish setup — please try again." }, { status: 500 });
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

  // Referral capture: link this newly-set-up company to its referrer from the
  // ?ref cookie, once. Owners only (the referred company); self-referral blocked;
  // best-effort so it never blocks onboarding.
  let refLinked = false;
  try {
    if (ensured.role === "owner") {
      const jar = await cookies();
      const refCode = (jar.get("lc_ref")?.value || "").toUpperCase();
      if (refCode) {
        const { data: thisOrg } = await db.from("organizations").select("referred_by_org").eq("id", ensured.org_id).maybeSingle();
        if (thisOrg && !thisOrg.referred_by_org) {
          const { data: refOrg } = await db.from("organizations").select("id").eq("referral_code", refCode).maybeSingle();
          if (refOrg && refOrg.id !== ensured.org_id) {
            await db.from("organizations").update({ referred_by_org: refOrg.id }).eq("id", ensured.org_id);
            await db.from("referrals").insert({ referrer_org: refOrg.id, referee_org: ensured.org_id, code: refCode });
            refLinked = true;
          }
        }
      }
    }
  } catch { /* referral linking is best-effort */ }

  const res = NextResponse.json({ ok: true });
  if (refLinked) res.cookies.set("lc_ref", "", { path: "/", maxAge: 0 }); // consume the cookie
  return res;
}

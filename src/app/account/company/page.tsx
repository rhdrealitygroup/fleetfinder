import { redirect } from "next/navigation";
import { getSessionContext, type Role } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/account";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CompanyForm } from "./CompanyForm";

export default async function CompanyPage() {
  const ctx = await getSessionContext();
  if (!ctx.user) redirect("/login?next=/account/company");

  let membership = ctx.membership;
  if (!membership) {
    const created = await ensureOrgForUser();
    if (created) membership = { org_id: created.org_id, role: created.role as Role };
  }

  const db = createServiceRoleClient();
  const { data: org } = membership
    ? await db.from("organizations").select("name").eq("id", membership.org_id).single()
    : { data: null };
  const { data: mem } = membership
    ? await db.from("memberships").select("first_name, last_name").eq("org_id", membership.org_id).eq("user_id", ctx.user.id).maybeSingle()
    : { data: null };

  const company = (org?.name && !/'s company$/.test(org.name)) ? org.name : "";
  const fullName = [mem?.first_name, mem?.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold mb-1">Company</h1>
        <p className="text-sm text-muted-foreground">Your company name and profile.</p>
      </div>
      <CompanyForm initialCompany={company} initialFullName={fullName} canRenameCompany={membership?.role === "owner"} />
    </div>
  );
}

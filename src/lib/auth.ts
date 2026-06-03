import "server-only";
import { createClient } from "@/lib/supabase/server";

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

    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", user.id)
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

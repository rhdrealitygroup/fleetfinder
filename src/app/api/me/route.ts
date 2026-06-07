// GET /api/me — lightweight identity for the client nav (who am I, am I a
// platform super-admin, what's my org role). No secrets; safe for the browser.

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";

export async function GET() {
  const { user, isSuperAdmin, membership } = await getSessionContext();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    email: user.email,
    isSuperAdmin,
    role: membership?.role || null,
  });
}

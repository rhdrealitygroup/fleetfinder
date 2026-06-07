// POST /api/stripe/portal — open the Stripe Customer Portal so the owner can
// update card, change seat count, or cancel. Returns a portal URL.

import { NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const { user, membership } = await getSessionContext();
  if (!user || !membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can manage billing" }, { status: 403 });

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", membership.org_id).single();
  if (!org?.stripe_customer_id) return NextResponse.json({ error: "No billing account yet" }, { status: 400 });

  const stripe = getStripe();
  const origin = new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/account/billing`,
  });
  return NextResponse.json({ url: session.url });
}

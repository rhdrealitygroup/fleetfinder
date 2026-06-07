import { redirect } from "next/navigation";

// Billing moved under the Account hub. Keep the old URL working.
export default function BillingRedirect() {
  redirect("/account/billing");
}

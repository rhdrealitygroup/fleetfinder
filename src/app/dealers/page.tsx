import { redirect } from "next/navigation";

// Dealer selection moved under the Account hub. Keep the old URL working.
export default function DealersRedirect() {
  redirect("/account/dealers");
}

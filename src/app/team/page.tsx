import { redirect } from "next/navigation";

// Team/Agents moved under the Account hub. Keep the old URL working.
export default function TeamRedirect() {
  redirect("/account/team");
}

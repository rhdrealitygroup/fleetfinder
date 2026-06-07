import { AppNav } from "@/components/AppNav";
import { AccountNav } from "./AccountNav";

// Account hub shell: top app nav + a left sub-menu shared by every account
// section (Overview, Company, Billing, Agents, Dealers). Section pages render
// only their own content — the chrome lives here.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <div className="max-w-6xl mx-auto px-5 py-6 grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
        <AccountNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

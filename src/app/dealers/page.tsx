import { AppNav } from "@/components/AppNav";
import { Building2 } from "lucide-react";

export default function DealersPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-3xl mx-auto p-5">
        <h1 className="font-heading text-2xl font-bold mb-1">Your dealer list</h1>
        <p className="text-sm text-muted-foreground mb-8">Pick the dealers you work with — every search scopes to them first.</p>
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-4 opacity-40" />
          <p className="text-foreground font-medium mb-1">Dealer directory coming next</p>
          <p className="text-sm">Once your account is set up, you&apos;ll choose your dealer relationships here and searches will prioritize them.</p>
        </div>
      </main>
    </div>
  );
}

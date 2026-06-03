"use client";

import Link from "next/link";
import { Star, Building2, Trash2, Search } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { useLocalCollection } from "@/lib/useLocalCollection";
import { moneyShort } from "@/lib/format";
import { makeHue } from "@/lib/inventory";

type Vehicle = {
  vin: string; year: number; make: string; model: string; trim: string;
  price: number; est_monthly: number; exterior_color: string; mileage: number;
  dealer_name: string; city: string; state: string; image_url: string;
  listing_url: string; is_cpo: boolean;
};

export default function SavedPage() {
  const { items, setItems, ready } = useLocalCollection<Vehicle>("ff_saved");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="max-w-5xl mx-auto p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold">Saved vehicles</h1>
            <p className="text-sm text-muted-foreground">{items.length} saved · synced to this device</p>
          </div>
          <Link href="/search" className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition flex items-center gap-2">
            <Search className="w-4 h-4" /> Search inventory
          </Link>
        </div>

        {ready && items.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <Star className="w-10 h-10 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">Nothing saved yet</p>
            <p className="text-sm">Star a car in Live Search and it&apos;ll show up here.</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((v) => {
            const hue = makeHue(v.make);
            return (
              <div key={v.vin || `${v.dealer_name}-${v.price}`} className="rounded-xl border border-border bg-card p-3 flex flex-col">
                <div className="relative h-32 rounded-lg overflow-hidden flex items-center justify-center mb-3 border border-border" style={{ background: v.image_url ? undefined : `linear-gradient(135deg, hsl(${hue} 40% 22%), hsl(${hue} 30% 12%))` }}>
                  {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : <span className="font-heading font-semibold tracking-[0.18em] text-lg uppercase text-white/70">{v.make}</span>}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-semibold text-[15px] truncate">{v.year} {v.make} {v.model}</div>{v.trim && <div className="text-sm text-primary font-medium">{v.trim}</div>}</div>
                  <div className="text-right shrink-0"><div className="font-semibold tnum">{moneyShort(v.price)}</div>{v.est_monthly > 0 && <div className="text-[11px] text-muted-foreground tnum">~{moneyShort(v.est_monthly)}/mo</div>}</div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5 shrink-0" /> {v.dealer_name || "—"}</span>
                  <button onClick={() => setItems(items.filter((s) => s.vin !== v.vin))} className="text-muted-foreground hover:text-destructive transition" title="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

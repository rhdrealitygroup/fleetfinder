"use client";

import { useCallback, useEffect, useState } from "react";

// The company's shared dealer selection, backed by /api/dealers/selection
// (per-org). Optimistic add/remove. Replaces the localStorage version.
export type OrgDealer = { id: string; name?: string; city?: string; state?: string };

export function useOrgDealers() {
  const [items, setItems] = useState<OrgDealer[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/dealers/selection");
      const d = await r.json();
      setItems(Array.isArray(d.dealers) ? d.dealers : []);
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = useCallback(async (dealer: OrgDealer) => {
    setItems((prev) => (prev.some((x) => x.id === dealer.id) ? prev : [dealer, ...prev]));
    try {
      const r = await fetch("/api/dealers/selection", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealer }),
      });
      if (!r.ok) await reload(); // failed write → resync so the UI matches the server
    } catch {
      await reload();
    }
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      const r = await fetch("/api/dealers/selection", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!r.ok) await reload();
    } catch {
      await reload();
    }
  }, [reload]);

  return { items, add, remove, ready, reload };
}

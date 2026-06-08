"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The company's shared dealer selection, backed by /api/dealers/selection
// (per-org). Optimistic add/remove. Replaces the localStorage version.
export type OrgDealer = { id: string; name?: string; city?: string; state?: string };

export function useOrgDealers() {
  const [items, setItems] = useState<OrgDealer[]>([]);
  const [ready, setReady] = useState(false);
  // Bumped on every optimistic mutation. A reload that started before a mutation
  // must NOT overwrite it (the server GET can race ahead of the add/remove POST),
  // or an optimistic add would silently vanish.
  const mutSeq = useRef(0);

  const reload = useCallback(async () => {
    const seq = mutSeq.current;
    try {
      const r = await fetch("/api/dealers/selection");
      const d = await r.json();
      if (seq === mutSeq.current) setItems(Array.isArray(d.dealers) ? d.dealers : []);
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
    mutSeq.current++;
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
    mutSeq.current++;
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

"use client";

import { useCallback, useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Per-AGENT saved vehicles + named lists, backed by /api/saved. A "list" is
// just the payload.list field. Optimistic; reloads after writes.
export function useSavedVehicles() {
  const [items, setItems] = useState<any[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/saved");
      const d = await r.json();
      setItems(Array.isArray(d.saved) ? d.saved : []);
      setLists(Array.isArray(d.lists) ? d.lists : []);
    } catch {
      /* ignore */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (vehicle: any, list = "Saved") => {
    setItems((prev) => [{ ...vehicle, list }, ...prev.filter((v) => !(v.vin && v.vin === vehicle.vin && (v.list || "Saved") === list))]);
    setLists((prev) => (prev.includes(list) ? prev : [...prev, list].sort()));
    try {
      const r = await fetch("/api/saved", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicle, list }),
      });
      const d = await r.json().catch(() => ({}));
      // Stamp the server id onto the optimistic row (so remove-by-id works).
      // No reload() here — it could resurrect a row removed in the meantime.
      if (d?.id) setItems((prev) => prev.map((v) => (v.vin === vehicle.vin && (v.list || "Saved") === list && !v.id ? { ...v, id: d.id } : v)));
    } catch {
      /* ignore */
    }
  }, []);

  const remove = useCallback(async (ref: { id?: string; vin?: string }) => {
    setItems((prev) => prev.filter((v) => (ref.id ? v.id !== ref.id : v.vin !== ref.vin)));
    try {
      await fetch("/api/saved", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const has = useCallback((vin?: string) => !!vin && items.some((v) => v.vin === vin), [items]);

  return { items, lists, save, remove, has, ready, reload };
}

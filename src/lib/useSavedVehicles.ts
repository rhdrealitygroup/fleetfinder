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
      if (!r.ok) { await reload(); return; } // failed write → resync from server
      const d = await r.json().catch(() => ({}));
      // Stamp the server id onto the optimistic row (so remove-by-id works).
      // No reload() on success — it could resurrect a row removed in the meantime.
      if (d?.id) setItems((prev) => prev.map((v) => (v.vin === vehicle.vin && (v.list || "Saved") === list && !v.id ? { ...v, id: d.id } : v)));
    } catch {
      await reload(); // network error → resync rather than leave a phantom row
    }
  }, [reload]);

  // Remove one saved row. `ref` is { id } (exact row), { vin, list } (one list,
  // default "Saved"), or { vin, allLists:true } (every list). List-scoped so a
  // search un-star never wipes a VIN from other customers' named lists.
  const remove = useCallback(async (ref: { id?: string; vin?: string; list?: string; allLists?: boolean }) => {
    const list = String(ref.list || "Saved");
    setItems((prev) => prev.filter((v) => {
      if (ref.id) return v.id !== ref.id;
      if (v.vin !== ref.vin) return true;
      return ref.allLists ? false : (v.list || "Saved") !== list;
    }));
    try {
      const r = await fetch("/api/saved", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref),
      });
      if (!r.ok) await reload();
    } catch {
      await reload();
    }
  }, [reload]);

  // has(vin) → saved in ANY list; has(vin, list) → saved in that specific list.
  const has = useCallback(
    (vin?: string, list?: string) =>
      !!vin && items.some((v) => v.vin === vin && (list === undefined || (v.list || "Saved") === list)),
    [items],
  );

  return { items, lists, save, remove, has, ready, reload };
}

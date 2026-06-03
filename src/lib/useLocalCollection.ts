"use client";

import { useCallback, useEffect, useState } from "react";

// Generic localStorage-backed collection hook. Used for saved vehicles and
// recent searches until the Supabase tables are wired (then this becomes a
// fallback for logged-out users). SSR-safe.
export function useLocalCollection<T>(key: string, max = 200) {
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [key]);

  const persist = useCallback(
    (next: T[]) => {
      setItems(next);
      try {
        localStorage.setItem(key, JSON.stringify(next.slice(0, max)));
      } catch {
        /* ignore */
      }
    },
    [key, max],
  );

  return { items, setItems: persist, ready };
}

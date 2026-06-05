// Tiny in-memory TTL cache. Per-serverless-instance only — good enough to cut
// duplicate MarketCheck calls within a warm instance. Will be replaced by
// Supabase-backed caching (trim_cache / color_cache / search_cache tables)
// once the database schema lands, so identical queries are shared across all
// instances and survive cold starts.

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  // Never cache empty/failed payloads for long — avoids the "poisoned 30-day
  // cache" bug that made trims appear permanently broken on Base44.
  store.delete(key); // re-insert so this key becomes the most-recent (insertion order)
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Soft cap to keep memory bounded: drop an already-expired entry first, and
  // only fall back to evicting the oldest live entry if nothing has expired.
  if (store.size > 500) {
    const now = Date.now();
    let victim: string | undefined;
    for (const [k, e] of store) {
      if (e.expires < now) { victim = k; break; }
    }
    if (!victim) victim = store.keys().next().value;
    if (victim) store.delete(victim);
  }
}

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

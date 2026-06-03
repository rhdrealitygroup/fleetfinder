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
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Soft cap to keep memory bounded.
  if (store.size > 500) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

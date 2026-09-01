// Lightweight in-memory TTL cache for read-heavy, rarely-changing config data (affordability
// rules, mandate limits, the product catalog). Cloudflare reuses a "hot" isolate across many
// requests before recycling it, so a module-scope Map is a free, zero-infrastructure cache for
// that isolate's lifetime. It is NOT shared across isolates/edge locations — for that, a KV or
// Durable Object-backed cache would be needed — but at DigiLend's current traffic volume (well
// under 1 request/second sustained) this removes the vast majority of redundant reads for data
// that only changes when an admin explicitly saves a settings page.
//
// Every write path that touches cached data MUST call invalidate()/invalidatePrefix() so an admin
// change is visible on the very next read, not after the TTL expires — see the "lower the
// auto-approval threshold live" and "toggle a product inactive" demo beats in the Feature
// Catalogue, both of which depend on this.

type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

package com.digibank.product.cache;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Minimal in-memory TTL cache — same shape as worker/src/lib/cache.ts. A Spring singleton bean
 * lives for the whole service process, so this is a zero-infrastructure win for read-heavy,
 * rarely-changing data (the product catalog) at DigiLend's current traffic volume (well under 1
 * request/second sustained). It is NOT shared across service instances if this is ever
 * horizontally scaled — for that, a shared cache (Redis) would be needed.
 *
 * Every write path that touches cached data MUST call evict()/evictPrefix() so an admin change
 * (e.g. toggling a product inactive) is visible on the very next read, not after the TTL expires
 * — see CatalogService's createProduct/updateProduct/deleteProduct.
 */
@Component
public class SimpleCache {

    private record Entry(Object value, long expiresAt) {}

    private final Map<String, Entry> store = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    public <T> T get(String key, long ttlMillis, Supplier<T> loader) {
        Entry hit = store.get(key);
        if (hit != null && hit.expiresAt() > System.currentTimeMillis()) {
            return (T) hit.value();
        }
        T value = loader.get();
        store.put(key, new Entry(value, System.currentTimeMillis() + ttlMillis));
        return value;
    }

    public void evict(String key) {
        store.remove(key);
    }

    public void evictPrefix(String prefix) {
        store.keySet().removeIf(k -> k.startsWith(prefix));
    }
}

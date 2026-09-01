package com.digibank.notification.resilience;

import java.util.function.Predicate;
import java.util.function.Supplier;

/** Same shape as worker/src/lib/resilience.ts's withRetry — bounded retries with exponential backoff. */
public final class Retry {

    private Retry() {}

    public static <T> T withRetry(Supplier<T> action, int retries, long baseDelayMillis, Predicate<RuntimeException> retryable) {
        RuntimeException lastError = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                return action.get();
            } catch (RuntimeException e) {
                lastError = e;
                if (attempt == retries || !retryable.test(e)) {
                    throw e;
                }
                try {
                    Thread.sleep(baseDelayMillis * (1L << attempt));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
        throw lastError;
    }
}

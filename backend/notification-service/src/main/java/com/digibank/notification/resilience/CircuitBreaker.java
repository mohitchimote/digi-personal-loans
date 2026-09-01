package com.digibank.notification.resilience;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Same shape as worker/src/lib/resilience.ts's CircuitBreaker, thread-safe here (unlike the
 * single-threaded Worker isolate, a JVM service instance handles concurrent requests). Trips
 * open after a run of consecutive failures and stays open for a cooldown window, so an outage in
 * a downstream dependency (Resend) fails fast instead of piling up doomed, timed-out requests.
 */
public class CircuitBreaker {

    private enum State { CLOSED, OPEN, HALF_OPEN }

    private final int failureThreshold;
    private final long resetAfterMillis;
    private final AtomicReference<State> state = new AtomicReference<>(State.CLOSED);
    private final AtomicInteger failureCount = new AtomicInteger(0);
    private final AtomicLong openedAt = new AtomicLong(0);

    public CircuitBreaker(int failureThreshold, long resetAfterMillis) {
        this.failureThreshold = failureThreshold;
        this.resetAfterMillis = resetAfterMillis;
    }

    /** Throws CircuitOpenException immediately (without calling action) while the breaker is open. */
    public <T> T run(Supplier<T> action) {
        if (state.get() == State.OPEN) {
            if (System.currentTimeMillis() - openedAt.get() < resetAfterMillis) {
                throw new CircuitOpenException(
                        "Circuit breaker open — skipping call to protect the caller and the downstream service.");
            }
            state.compareAndSet(State.OPEN, State.HALF_OPEN);
        }
        try {
            T result = action.get();
            onSuccess();
            return result;
        } catch (RuntimeException e) {
            onFailure();
            throw e;
        }
    }

    private void onSuccess() {
        failureCount.set(0);
        state.set(State.CLOSED);
    }

    private void onFailure() {
        int count = failureCount.incrementAndGet();
        if (state.get() == State.HALF_OPEN || count >= failureThreshold) {
            state.set(State.OPEN);
            openedAt.set(System.currentTimeMillis());
        }
    }
}

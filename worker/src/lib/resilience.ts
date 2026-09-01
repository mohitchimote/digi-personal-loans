// Resilience primitives for the Worker's outbound third-party calls (currently just Resend, via
// lib/email.ts — the only real network call this Worker makes to an external system today).
// Cloudflare reuses a "hot" isolate across many requests before recycling it, so the module-scope
// circuit-breaker state below persists usefully across requests within that isolate's lifetime.
// It is NOT shared across isolates/edge locations — for that, a Durable Object or KV-backed
// breaker would be needed — but for a single-digit-TPS workload this is a proportionate,
// zero-infrastructure improvement over calling out with no protection at all.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number; retryable?: (e: unknown) => boolean }
): Promise<T> {
  const { retries, baseDelayMs, retryable = () => true } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === retries || !retryable(e)) throw e;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: BreakerState = "CLOSED";
  private failureCount = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetAfterMs: number
  ) {}

  /** Throws immediately (without calling fn) while the breaker is open. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.openedAt < this.resetAfterMs) {
        throw new Error("Circuit breaker open — skipping call to protect the caller and the downstream service.");
      }
      this.state = "HALF_OPEN";
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failureCount += 1;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }

  get currentState() {
    return this.state;
  }
}

// S4 remainder (ARCHITECTURE_REVIEW_GAPS.md) — structured JSON logging, matching the Java side's
// logback.xml/LogstashEncoder shape (level/message/error/timestamp as top-level JSON fields).
//
// No correlationId field here, unlike the Java side — the worker has no equivalent request-scoped
// correlation ID mechanism (it's a single-process monolith, not a chain of services a header needs
// to propagate across), and adding one is net-new scope beyond "structured logging," not part of
// this item. Flagged explicitly rather than silently left out.

export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: "ERROR",
      message,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      timestamp: new Date().toISOString(),
      ...context,
    })
  );
}

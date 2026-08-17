import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function success<T>(c: Context, message: string, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, message, data }, status);
}

export function fail(c: Context, message: string, status: ContentfulStatusCode = 400) {
  return c.json({ success: false, message, data: null }, status);
}

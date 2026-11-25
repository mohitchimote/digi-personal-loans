/**
 * Initial term for a product's slider: the term the customer asked for, kept within the
 * product's own min/max. Falls back to the product minimum when no term was requested.
 */
export function initialTerm(requested: number | null | undefined, min: number, max: number | null | undefined): number {
  if (!requested || requested <= 0) return min;
  const upper = max != null && max >= min ? max : requested;
  return Math.min(Math.max(requested, min), upper);
}

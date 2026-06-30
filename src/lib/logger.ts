/**
 * Minimal server-side error logger.
 *
 * Today this wraps `console.error` so the rest of the codebase does not
 * depend directly on the console API. In the future it can be swapped for a
 * structured logger or error-tracking service without touching consumers.
 */
export function logServerError(message: string, error?: unknown): void {
  // eslint-disable-next-line no-console -- this is the single place where server errors are logged
  console.error(message, error);
}

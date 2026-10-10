/**
 * Cursor: the created_at of the newest feedback row already triaged. Always
 * fixed-width UTC with microseconds, so string order is time order and the
 * value round-trips exactly through Postgres `::timestamptz`.
 */
export type Cursor = string;

export const CURSOR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export const EPOCH_CURSOR: Cursor = "1970-01-01T00:00:00.000000Z";

/** Strict: anything else must never reach SQL or the ledger. */
export function isCursor(value: unknown): value is Cursor {
  return typeof value === "string" && CURSOR_PATTERN.test(value);
}

/** The latest of the given cursors (fixed width, so string order is enough). */
export function latestCursor(values: Cursor[]): Cursor {
  return values.reduce((a, b) => (b > a ? b : a), EPOCH_CURSOR);
}

/**
 * Cursor: the (created_at, id) of the newest feedback row already triaged.
 * Rows are read in (created_at, id) order strictly after it, so rows sharing
 * a timestamp (one transaction's `now()`) are never skipped at a batch cut.
 * created_at is fixed-width UTC with microseconds, so string order is time
 * order and the value round-trips exactly through Postgres `::timestamptz`.
 */
export interface Cursor {
  createdAt: string;
  id: string;
}

export const CREATED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Feedback ids are UUIDs in storage; fakes may use short ids. */
export const CURSOR_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const EPOCH_CURSOR: Cursor = Object.freeze({
  createdAt: "1970-01-01T00:00:00.000000Z",
  id: "00000000-0000-0000-0000-000000000000",
});

/** Strict: anything else must never reach SQL or the ledger. */
export function isCursor(value: unknown): value is Cursor {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "createdAt,id") return false;
  const { createdAt, id } = value as Record<string, unknown>;
  return (
    typeof createdAt === "string" &&
    CREATED_AT_PATTERN.test(createdAt) &&
    typeof id === "string" &&
    CURSOR_ID_PATTERN.test(id)
  );
}

export function cursorOf(row: { createdAt: string; id: string }): Cursor {
  return { createdAt: row.createdAt, id: row.id };
}

/** Negative, zero or positive, in (created_at, id) order. */
export function compareCursors(a: Cursor, b: Cursor): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** The latest of the given cursors. */
export function latestCursor(values: Cursor[]): Cursor {
  return values.reduce(
    (a, b) => (compareCursors(b, a) > 0 ? cursorOf(b) : a),
    EPOCH_CURSOR,
  );
}

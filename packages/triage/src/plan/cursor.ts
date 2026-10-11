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

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const EPOCH_CURSOR: Cursor = Object.freeze({
  createdAt: "1970-01-01T00:00:00.000000Z",
  id: "00000000-0000-0000-0000-000000000000",
});

/**
 * Strict: exactly `createdAt` (fixed-width UTC) and `id` (a UUID). Both are
 * interpolated into SQL, so anything else must never get that far.
 */
export function isCursor(value: unknown): value is Cursor {
  if (typeof value !== "object" || value === null) return false;
  if (Object.keys(value).sort().join(",") !== "createdAt,id") return false;
  const { createdAt, id } = value as Record<string, unknown>;
  return (
    typeof createdAt === "string" &&
    CREATED_AT_PATTERN.test(createdAt) &&
    typeof id === "string" &&
    UUID_PATTERN.test(id)
  );
}

/** The latest of the given rows in (created_at, id) order, starting from the epoch. */
export function latestCursor(rows: Cursor[]): Cursor {
  return rows.reduce<Cursor>(
    (a, b) =>
      b.createdAt > a.createdAt || (b.createdAt === a.createdAt && b.id > a.id)
        ? { createdAt: b.createdAt, id: b.id }
        : a,
    EPOCH_CURSOR,
  );
}

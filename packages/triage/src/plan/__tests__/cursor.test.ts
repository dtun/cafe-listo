import { describe, expect, it } from "vitest";
import { EPOCH_CURSOR, isCursor, latestCursor } from "../index";

const T = "2026-10-05T10:00:00.000000Z";
const EARLIER = "2026-10-04T10:00:00.000000Z";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("latestCursor", () => {
  it("starts from the epoch", () => {
    expect(latestCursor([])).toEqual(EPOCH_CURSOR);
  });

  it("orders by created_at, then id", () => {
    expect(
      latestCursor([
        { createdAt: T, id: B },
        { createdAt: T, id: C },
        { createdAt: T, id: A },
        { createdAt: EARLIER, id: C },
      ]),
    ).toEqual({ createdAt: T, id: C });
    expect(
      latestCursor([
        { createdAt: T, id: A },
        { createdAt: EARLIER, id: C },
      ]),
    ).toEqual({ createdAt: T, id: A });
  });

  it("keeps only the cursor fields", () => {
    const row = { createdAt: T, id: A, summary: "x" };
    expect(Object.keys(latestCursor([row])).sort()).toEqual([
      "createdAt",
      "id",
    ]);
  });
});

describe("isCursor", () => {
  it.each<[string, unknown]>([
    ["a string", T],
    ["null", null],
    ["an array", [T, A]],
    ["a date-only timestamp", { createdAt: "2026-10-05", id: A }],
    ["millisecond precision", { createdAt: "2026-10-05T10:00:00.000Z", id: A }],
    [
      "a non-UTC offset",
      { createdAt: "2026-10-05T10:00:00.000000+01:00", id: A },
    ],
    ["SQL in created_at", { createdAt: `${T}'::timestamptz; --`, id: A }],
    ["SQL in the id", { createdAt: T, id: "a' or '1'='1" }],
    ["a short id", { createdAt: T, id: "a" }],
    [
      "an uppercase UUID",
      { createdAt: T, id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    ],
    ["an empty id", { createdAt: T, id: "" }],
    ["a numeric id", { createdAt: T, id: 1 }],
    ["a missing id", { createdAt: T }],
    ["an extra key", { createdAt: T, id: A, more: 1 }],
  ])("rejects %s", (_name, value) => {
    expect(isCursor(value)).toBe(false);
  });

  it("accepts the epoch and a UUID id", () => {
    expect(isCursor(EPOCH_CURSOR)).toBe(true);
    expect(isCursor({ createdAt: T, id: A })).toBe(true);
  });
});

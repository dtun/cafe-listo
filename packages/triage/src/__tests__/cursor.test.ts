import { describe, expect, it } from "vitest";
import {
  EPOCH_CURSOR,
  compareCursors,
  isCursor,
  latestCursor,
} from "../cursor";

const T = "2026-10-05T10:00:00.000000Z";

describe("cursor", () => {
  it("orders by created_at, then id", () => {
    expect(
      compareCursors({ createdAt: T, id: "a" }, { createdAt: T, id: "b" }),
    ).toBeLessThan(0);
    expect(
      compareCursors(
        { createdAt: "2026-10-04T10:00:00.000000Z", id: "z" },
        { createdAt: T, id: "a" },
      ),
    ).toBeLessThan(0);
    expect(
      compareCursors({ createdAt: T, id: "a" }, { createdAt: T, id: "a" }),
    ).toBe(0);
  });

  it("picks the latest, starting from the epoch", () => {
    expect(latestCursor([])).toEqual(EPOCH_CURSOR);
    expect(
      latestCursor([
        { createdAt: T, id: "b" },
        { createdAt: T, id: "c" },
        { createdAt: "2026-10-04T10:00:00.000000Z", id: "z" },
      ]),
    ).toEqual({ createdAt: T, id: "c" });
  });

  it.each<[string, unknown]>([
    ["a string", T],
    ["null", null],
    ["a bad timestamp", { createdAt: "2026-10-05", id: "a" }],
    ["an id with quotes", { createdAt: T, id: "a' or '1'='1" }],
    ["an empty id", { createdAt: T, id: "" }],
    ["an extra key", { createdAt: T, id: "a", more: 1 }],
  ])("rejects %s", (_name, value) => {
    expect(isCursor(value)).toBe(false);
  });

  it("accepts the epoch and a UUID id", () => {
    expect(isCursor(EPOCH_CURSOR)).toBe(true);
    expect(
      isCursor({ createdAt: T, id: "11111111-1111-4111-8111-111111111111" }),
    ).toBe(true);
  });
});

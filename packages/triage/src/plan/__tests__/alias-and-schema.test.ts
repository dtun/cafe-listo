import { describe, expect, it } from "vitest";
import { aliasReporters, triagePlanJsonSchema } from "../index";
import { RAW_FEEDBACK } from "./fixtures";

describe("aliasReporters", () => {
  it("drops user ids", () => {
    const aliased = aliasReporters(RAW_FEEDBACK);
    expect(aliased.every((row) => !("userId" in row))).toBe(true);
    expect(JSON.stringify(aliased)).not.toMatch(/aaaaaaaa|bbbbbbbb/);
  });

  it("gives each reporter a stable per-run alias", () => {
    expect(aliasReporters(RAW_FEEDBACK).map((row) => row.reporter)).toEqual([
      "r2",
      "r1",
      "r2",
    ]);
  });

  it("is deterministic", () => {
    expect(aliasReporters(RAW_FEEDBACK)).toEqual(aliasReporters(RAW_FEEDBACK));
  });

  it("keeps the rest of each row", () => {
    const [first] = aliasReporters(RAW_FEEDBACK);
    expect(first).toMatchObject({
      id: "f1",
      kind: "idea",
      summary: "a",
      createdAt: "2026-10-01T10:00:00.000000Z",
    });
  });
});

describe("triagePlanJsonSchema", () => {
  it("describes a closed object with summary and actions", () => {
    const schema = triagePlanJsonSchema();
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["summary", "actions"],
    });
    expect(schema).not.toHaveProperty("$schema");
  });

  it("limits action types to create, comment and skip", () => {
    const json = JSON.stringify(triagePlanJsonSchema());
    expect(json).toContain('"create_issue"');
    expect(json).toContain('"comment_issue"');
    expect(json).toContain('"skip"');
    expect(json).not.toContain("close");
  });
});

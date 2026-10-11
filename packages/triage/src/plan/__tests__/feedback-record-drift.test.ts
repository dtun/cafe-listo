import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  feedbackKindSchema,
  type FeedbackKind,
  type NewFeedback,
} from "@cafe-listo/shared";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { FeedbackRecord } from "../index";

// Type-level checks: `pnpm typecheck` fails if shared's NewFeedback drifts from FeedbackRecord.
describe("FeedbackRecord", () => {
  it("has exactly the fields of the shared NewFeedback", () => {
    expectTypeOf<keyof FeedbackRecord>().toEqualTypeOf<keyof NewFeedback>();
  });

  it("takes kind from the shared FeedbackKind", () => {
    expectTypeOf<FeedbackRecord["kind"]>().toEqualTypeOf<FeedbackKind>();
  });

  it("stores optional fields as nullable and createdAt as a string", () => {
    expectTypeOf<FeedbackRecord["details"]>().toEqualTypeOf<string | null>();
    expectTypeOf<FeedbackRecord["userQuote"]>().toEqualTypeOf<string | null>();
    expectTypeOf<FeedbackRecord["summary"]>().toEqualTypeOf<string>();
    expectTypeOf<FeedbackRecord["createdAt"]>().toEqualTypeOf<string>();
  });
});

describe("feedback kind drift", () => {
  it("matches the feedback table's check constraint", () => {
    const dir = join(import.meta.dirname, "../../../../../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const check = /kind text not null check \(kind in \(([^)]*)\)\)/.exec(sql);
    const kinds = [...(check?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(kinds.sort()).toEqual([...feedbackKindSchema.options].sort());
  });
});

import type { FeedbackKind, NewFeedback } from "@cafe-listo/shared";
import { describe, expectTypeOf, it } from "vitest";
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

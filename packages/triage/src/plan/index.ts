/**
 * TriagePlan module: deep, pure and in-process. Its interface is the plan
 * schema, reporter aliasing and plan validation; adapters and the use case
 * depend on it, never the other way round.
 */
import type { Feedback, FeedbackRecord } from "./types";

export {
  TriagePlanSchema,
  parsePlan,
  triagePlanJsonSchema,
  type ParsedPlan,
  type TriageAction,
  type TriagePlan,
} from "./schema";
export { DEFAULT_POLICY, validatePlan } from "./validate";
export type {
  Feedback,
  FeedbackRecord,
  IssueRef,
  PlanContext,
  Problem,
  TriagePolicy,
} from "./types";

/**
 * Replaces each user id with a per-run alias (r1, r2, ...), numbered by sorted
 * id so the same batch always aliases the same way. Raw ids go no further.
 */
export function aliasReporters(rows: FeedbackRecord[]): Feedback[] {
  const users = [...new Set(rows.map((row) => row.userId))].sort();
  return rows.map(({ userId, ...row }) => ({
    ...row,
    reporter: `r${users.indexOf(userId) + 1}`,
  }));
}

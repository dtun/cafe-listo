/**
 * TriagePlan module: deep, pure and in-process. Its interface is the plan
 * schema, reporter aliasing, plan validation, the cursor and the provenance
 * marker. The CLI depends on it, never the other way round.
 */
import type { Feedback, FeedbackRecord } from "./types";

export {
  CREATED_AT_PATTERN,
  CURSOR_ID_PATTERN,
  EPOCH_CURSOR,
  UUID_PATTERN,
  compareCursors,
  cursorOf,
  isCursor,
  latestCursor,
  type Cursor,
} from "./cursor";
export { MARKER_PATTERN, provenanceFooter, provenanceMarker } from "./marker";
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

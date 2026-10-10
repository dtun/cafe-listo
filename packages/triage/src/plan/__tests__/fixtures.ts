import type { FeedbackRecord, TriageAction, TriagePlan } from "../index";
import type { PlanContext } from "../index";
import { DEFAULT_POLICY } from "../index";

const BODY =
  "## Problem\nUsers want per-person quantities.\n\n## Evidence\n1 report this week.\n\n## Possible direction\n- Non-binding idea.\n\n## Open questions\nNone";

export const CREATE: TriageAction = {
  type: "create_issue",
  feedback_ids: ["f1"],
  reason: "New need not covered by an existing issue.",
  title: "feat(mcp-server): support custom quantities per household member",
  body: BODY,
  labels: ["feedback", "needs-triage", "feature", "mcp-server"],
};

export const COMMENT: TriageAction = {
  type: "comment_issue",
  feedback_ids: ["f2"],
  reason: "Open issue #12 covers it.",
  issue_number: 12,
  body: "New feedback this week (1 report):\n- Household of 4 asked for the same thing.",
};

export const SKIP: TriageAction = {
  type: "skip",
  feedback_ids: ["f3"],
  reason: "Smoke test.",
};

/** valid.json from #58. */
export function validPlan(): TriagePlan {
  return structuredClone({
    summary:
      "Three reports came in. Filed one feature, commented on one issue, skipped a smoke test.",
    actions: [CREATE, COMMENT, SKIP],
  });
}

/** valid.json with one action replaced or edited. */
export function planWith(
  index: number,
  patch: Partial<TriageAction>,
): TriagePlan {
  const plan = validPlan();
  plan.actions[index] = { ...plan.actions[index], ...patch };
  return plan;
}

/** valid.json with text appended to the create's body. */
export function planWithBodyText(text: string): TriagePlan {
  return planWith(0, { body: `${BODY}\n${text}` });
}

/** issues.json from #58. */
export const ISSUES: PlanContext["issues"] = [
  { number: 12, state: "OPEN", author: "dtun", labels: ["feature"] },
  { number: 20, state: "OPEN", author: "outsider", labels: [] },
  {
    number: 30,
    state: "OPEN",
    author: "outsider",
    labels: ["feedback", "needs-triage"],
  },
  { number: 5, state: "CLOSED", author: "dtun", labels: ["bug"] },
];

export const CONTEXT: PlanContext = {
  feedbackIds: ["f1", "f2", "f3"],
  issues: ISSUES,
  policy: { ...DEFAULT_POLICY, trustedAuthors: ["dtun"] },
};

/** feedback.raw.json from #58, shaped as the reader returns it. */
export const RAW_FEEDBACK: FeedbackRecord[] = [
  {
    id: "f1",
    userId: "bbbbbbbb-0000-0000-0000-000000000002",
    kind: "idea",
    summary: "a",
    details: null,
    toolName: null,
    itemId: null,
    userQuote: null,
    createdAt: "2026-10-01T10:00:00.000000Z",
  },
  {
    id: "f2",
    userId: "aaaaaaaa-0000-0000-0000-000000000001",
    kind: "bug",
    summary: "b",
    details: null,
    toolName: null,
    itemId: null,
    userQuote: null,
    createdAt: "2026-10-02T10:00:00.000000Z",
  },
  {
    id: "f3",
    userId: "bbbbbbbb-0000-0000-0000-000000000002",
    kind: "other",
    summary: "c",
    details: null,
    toolName: null,
    itemId: null,
    userQuote: null,
    createdAt: "2026-10-03T10:00:00.000000Z",
  },
];

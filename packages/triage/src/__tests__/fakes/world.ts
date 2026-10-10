import {
  CREATE,
  ISSUES,
  RAW_FEEDBACK,
  validPlan,
} from "../../plan/__tests__/fixtures";
import { DEFAULT_POLICY, type TriagePlan } from "../../plan";
import type { Issue } from "../../ports";
import { TriageFeedback } from "../../usecases/triage-feedback";
import { FakePlanAnalyzer } from "./fake-plan-analyzer";
import { fixedClock } from "./fixed-clock";
import { InMemoryFeedbackReader } from "./in-memory-feedback-reader";
import { InMemoryIssueTracker } from "./in-memory-issue-tracker";
import { InMemoryTriageLedger } from "./in-memory-triage-ledger";

export const TRACKER_ISSUES: Issue[] = ISSUES.map((issue) => ({
  ...issue,
  title: `Issue ${issue.number}`,
  body: `Body of ${issue.number}`,
}));

/** valid.json plus a second create, so a failure can land between creates. */
export function fourActionPlan(): TriagePlan {
  const plan = validPlan();
  plan.actions.push({
    ...structuredClone(CREATE),
    title: "fix(mobile): checked items reset after reconnect",
  });
  return plan;
}

export const POLICY = { ...DEFAULT_POLICY, trustedAuthors: ["dtun"] };

export interface World {
  reader: InMemoryFeedbackReader;
  tracker: InMemoryIssueTracker;
  analyzer: FakePlanAnalyzer;
  ledger: InMemoryTriageLedger;
  triage: TriageFeedback;
}

/** Fakes wired into the use case, seeded with the #58 fixtures. */
export function world(plan: unknown = fourActionPlan()): World {
  const reader = new InMemoryFeedbackReader(structuredClone(RAW_FEEDBACK));
  const tracker = new InMemoryIssueTracker(structuredClone(TRACKER_ISSUES));
  const analyzer = new FakePlanAnalyzer(plan);
  const ledger = new InMemoryTriageLedger();
  const triage = new TriageFeedback({
    reader,
    tracker,
    analyzer,
    ledger,
    clock: fixedClock(),
    policy: POLICY,
  });
  return { reader, tracker, analyzer, ledger, triage };
}

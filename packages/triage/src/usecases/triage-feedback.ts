import type { Cursor } from "../cursor";
import type { TriagePolicy } from "../plan";
import type {
  FeedbackReader,
  IssueTracker,
  PlanAnalyzer,
  TriageLedger,
} from "../ports";
import { fail, type Clock, type UseCaseResult } from "./types";

export interface ActionOutcome {
  index: number;
  type: "create_issue" | "comment_issue";
  /** The issue title, or `#N` for a comment. */
  target: string;
  feedbackIds: string[];
  reason: string;
  /** null in a dry run. */
  url: string | null;
}

export interface SkipOutcome {
  index: number;
  feedbackIds: string[];
  reason: string;
}

export interface TriageReport {
  dryRun: boolean;
  status: "triaged" | "nothing_new" | "pending_plan";
  summary: string | null;
  feedbackCount: number;
  actions: ActionOutcome[];
  skips: SkipOutcome[];
  /** Actions finished from a pending plan before this run's fresh analysis. */
  resumed: ActionOutcome[] | null;
  /** Dry run only: an unfinished plan that a real run resumes first. */
  pending?: { done: number; total: number };
  cursor: { from: Cursor; to: Cursor };
}

export interface TriageFeedbackDeps {
  reader: FeedbackReader;
  tracker: IssueTracker;
  analyzer: PlanAnalyzer;
  ledger: TriageLedger;
  clock: Clock;
  policy: TriagePolicy;
}

export class TriageFeedback {
  constructor(private readonly deps: TriageFeedbackDeps) {}

  async execute(
    options: { dryRun?: boolean } = {},
  ): Promise<UseCaseResult<TriageReport>> {
    void options;
    void this.deps;
    return fail("dependency_failed", "not implemented");
  }
}

import {
  EPOCH_CURSOR,
  cursorOf,
  isCursor,
  latestCursor,
  type Cursor,
} from "../cursor";
import {
  aliasReporters,
  parsePlan,
  validatePlan,
  type IssueRef,
  type TriageAction,
  type TriagePolicy,
} from "../plan";
import type {
  FeedbackReader,
  Issue,
  IssueTracker,
  PendingPlan,
  PlanAnalyzer,
  TriageLedger,
} from "../ports";
import {
  fail,
  ok,
  type Clock,
  type TriageErrorCode,
  type UseCaseResult,
} from "./types";

/**
 * The report is safe to log by construction: counts, indexes, action types,
 * issue numbers and URLs only. No titles, bodies, reasons, summaries or
 * feedback ids; those live in the ledger and on GitHub.
 */
export interface ActionOutcome {
  index: number;
  type: "create_issue" | "comment_issue";
  /** The commented issue; absent for creates. */
  issueNumber?: number;
  feedbackCount: number;
  /** null in a dry run. */
  url: string | null;
}

export interface SkipOutcome {
  index: number;
  feedbackCount: number;
}

export interface TriageReport {
  dryRun: boolean;
  status: "triaged" | "nothing_new" | "pending_plan";
  feedbackCount: number;
  actions: ActionOutcome[];
  skips: SkipOutcome[];
  /** Actions finished from a pending plan before this run's fresh analysis. */
  resumed: ActionOutcome[] | null;
  /** Dry run only: an unfinished plan that a real run resumes first. */
  pending?: { done: number; total: number };
  cursor: { from: Cursor; to: Cursor };
}

export interface TriageLimits {
  feedback: number;
  openIssues: number;
  closedIssues: number;
  closedWindowDays: number;
}

export const DEFAULT_LIMITS: TriageLimits = {
  feedback: 500,
  openIssues: 300,
  closedIssues: 200,
  closedWindowDays: 90,
};

export interface TriageFeedbackDeps {
  reader: FeedbackReader;
  tracker: IssueTracker;
  analyzer: PlanAnalyzer;
  ledger: TriageLedger;
  clock: Clock;
  policy: TriagePolicy;
  limits?: TriageLimits;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown inside execute() only; turned into a failed UseCaseResult. */
class Stop extends Error {
  constructor(
    readonly code: TriageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Stop("dependency_failed", `${what} failed: ${errorText(error)}`);
  }
}

function footer(feedbackIds: string[]): string {
  return `\n\n---\n<sub>Filed by the weekly feedback triage loop from feedback records: ${feedbackIds.join(", ")}</sub>`;
}

function outcome(
  action: TriageAction,
  index: number,
  url: string | null,
): ActionOutcome {
  return {
    index,
    type: action.type as ActionOutcome["type"],
    ...(action.type === "comment_issue" && {
      issueNumber: action.issue_number,
    }),
    feedbackCount: action.feedback_ids.length,
    url,
  };
}

function skips(actions: TriageAction[]): SkipOutcome[] {
  return actions.flatMap((action, index) =>
    action.type === "skip"
      ? [{ index, feedbackCount: action.feedback_ids.length }]
      : [],
  );
}

function toRef({ number, state, author, labels }: Issue): IssueRef {
  return { number, state, author, labels };
}

/**
 * Feedback in, validated triage plan, issues filed. Resumes an unfinished
 * plan before anything else, and moves the cursor only once every action of
 * a plan has succeeded.
 */
export class TriageFeedback {
  private readonly limits: TriageLimits;

  constructor(private readonly deps: TriageFeedbackDeps) {
    this.limits = deps.limits ?? DEFAULT_LIMITS;
  }

  async execute(
    options: { dryRun?: boolean } = {},
  ): Promise<UseCaseResult<TriageReport>> {
    try {
      return await this.run(options.dryRun ?? false);
    } catch (error) {
      if (error instanceof Stop) return fail(error.code, error.message);
      throw error;
    }
  }

  private async run(dryRun: boolean): Promise<UseCaseResult<TriageReport>> {
    const { ledger, reader, analyzer, policy } = this.deps;
    const pending = await attempt("reading the pending plan", () =>
      ledger.getPendingPlan(),
    );
    const cursor = await this.storedCursor();
    let resumed: ActionOutcome[] | null = null;

    if (pending) {
      if (dryRun) return ok(this.pendingReport(pending, cursor));
      const problems = validatePlan(pending.plan, {
        ...pending.context,
        policy,
      });
      if (problems.length) {
        return fail(
          "invalid_pending",
          "the pending plan no longer validates; inspect it, then remove it from the ledger",
          problems,
        );
      }
      resumed = await this.perform(pending);
    }

    const from = resumed ? await this.storedCursor() : cursor;
    const rows = await attempt("reading feedback", () =>
      reader.listSince(from, this.limits.feedback),
    );
    if (rows.length === 0) {
      return ok({
        dryRun,
        status: "nothing_new",
        feedbackCount: 0,
        actions: [],
        skips: [],
        resumed,
        cursor: { from, to: from },
      });
    }

    const feedback = aliasReporters(rows);
    const advanceTo = latestCursor(rows.map(cursorOf));
    const issues = await this.issuesForDedupe();

    const raw = await attempt("analysis", () =>
      analyzer.analyze({
        feedback,
        issues,
        trustedAuthors: policy.trustedAuthors,
      }),
    );
    const parsed = parsePlan(raw);
    if (!parsed.ok) {
      return fail(
        "invalid_plan",
        "the analyzer's output is not a triage plan",
        parsed.problems,
      );
    }
    const { plan } = parsed;
    const context = {
      feedbackIds: rows.map((row) => row.id),
      issues: issues.map(toRef),
    };
    const problems = validatePlan(plan, { ...context, policy });
    if (problems.length) {
      return fail(
        "invalid_plan",
        `plan rejected (${problems.length} problems); nothing was filed`,
        problems,
      );
    }

    let actions: ActionOutcome[];
    if (dryRun) {
      actions = plan.actions.flatMap((action, index) =>
        action.type === "skip" ? [] : [outcome(action, index, null)],
      );
    } else {
      const next: PendingPlan = { plan, context, advanceTo, done: [] };
      await attempt("saving the pending plan", () =>
        ledger.savePendingPlan(next),
      );
      actions = await this.perform(next);
    }

    return ok({
      dryRun,
      status: "triaged",
      feedbackCount: rows.length,
      actions,
      skips: skips(plan.actions),
      resumed,
      cursor: { from, to: advanceTo },
    });
  }

  private async storedCursor(): Promise<Cursor> {
    const stored = await attempt("reading the cursor", () =>
      this.deps.ledger.getCursor(),
    );
    if (stored === null) return EPOCH_CURSOR;
    if (!isCursor(stored)) {
      throw new Stop("dependency_failed", "stored cursor is malformed");
    }
    return stored;
  }

  /** Open issues plus recently closed ones. An incomplete open list fails the run. */
  private async issuesForDedupe(): Promise<Issue[]> {
    const { tracker, clock } = this.deps;
    const { openIssues, closedIssues, closedWindowDays } = this.limits;
    const since = new Date(clock.now().getTime() - closedWindowDays * DAY_MS);
    const [open, closed, openCount] = await attempt("listing issues", () =>
      Promise.all([
        tracker.listOpen(openIssues),
        tracker.listClosedSince(since, closedIssues),
        tracker.openCount(),
      ]),
    );
    const expected = Math.min(openCount, openIssues);
    if (open.length < expected) {
      throw new Stop(
        "incomplete_issues",
        `open issue list incomplete (${open.length} of ${openCount}); dedupe would miss issues`,
      );
    }
    return [...open, ...closed];
  }

  /**
   * Executes every action not yet done, marking each as it lands, then clears
   * the pending plan and advances the cursor. Returns what this call filed.
   */
  private async perform(pending: PendingPlan): Promise<ActionOutcome[]> {
    const { tracker, ledger } = this.deps;
    const done = new Set(pending.done.map((d) => d.index));
    const total = pending.plan.actions.length;
    const filed: ActionOutcome[] = [];

    for (const [index, action] of pending.plan.actions.entries()) {
      if (done.has(index)) continue;
      let url: string | null = null;
      try {
        if (action.type === "create_issue") {
          url = await tracker.create({
            title: action.title ?? "",
            body: (action.body ?? "") + footer(action.feedback_ids),
            labels: action.labels ?? [],
          });
        } else if (action.type === "comment_issue") {
          url = await tracker.comment(
            action.issue_number!,
            (action.body ?? "") + footer(action.feedback_ids),
          );
        }
      } catch (error) {
        throw new Stop(
          "action_failed",
          `action ${index} (${action.type}) failed (${done.size}/${total} actions done; next run resumes): ${errorText(error)}`,
        );
      }
      await attempt("recording a finished action", () =>
        ledger.markActionDone(index, url),
      );
      done.add(index);
      if (action.type !== "skip") filed.push(outcome(action, index, url));
    }

    await attempt("advancing the cursor", () =>
      ledger.clearPending(pending.advanceTo),
    );
    return filed;
  }

  private pendingReport(pending: PendingPlan, cursor: Cursor): TriageReport {
    return {
      dryRun: true,
      status: "pending_plan",
      feedbackCount: pending.context.feedbackIds.length,
      actions: [],
      skips: [],
      resumed: null,
      pending: {
        done: pending.done.length,
        total: pending.plan.actions.length,
      },
      cursor: { from: cursor, to: pending.advanceTo },
    };
  }
}

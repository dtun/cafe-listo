/**
 * Seams between the TriageFeedback use case and the outside world. Each port
 * has a production adapter in adapters/ and an in-memory fake in
 * __tests__/fakes/.
 */
import type { Cursor } from "./plan/cursor";
import type { Feedback, FeedbackRecord, IssueRef, TriagePlan } from "./plan";

export interface FeedbackReader {
  /** Rows created strictly after `cursor`, oldest first, at most `limit`. */
  listSince(cursor: Cursor, limit: number): Promise<FeedbackRecord[]>;
}

export interface Issue extends IssueRef {
  title: string;
  /** May be truncated; issue bodies are untrusted text. */
  body: string;
}

export interface NewIssue {
  title: string;
  body: string;
  labels: string[];
}

export interface IssueTracker {
  listOpen(limit: number): Promise<Issue[]>;
  listClosedSince(since: Date, limit: number): Promise<Issue[]>;
  /** Total open issues, to prove listOpen was complete. */
  openCount(): Promise<number>;
  /** Returns the new issue's URL. */
  create(issue: NewIssue): Promise<string>;
  /** Returns the comment's URL. */
  comment(issueNumber: number, body: string): Promise<string>;
  /**
   * URL of an issue whose body carries `marker` (a provenance marker the use
   * case appends), or null. Guards against filing twice after a crash.
   */
  findMarkedIssue(marker: string): Promise<string | null>;
  /** URL of a comment on `issueNumber` whose body carries `marker`, or null. */
  findMarkedComment(
    issueNumber: number,
    marker: string,
  ): Promise<string | null>;
}

export interface AnalyzerInput {
  feedback: Feedback[];
  issues: Issue[];
  trustedAuthors: string[];
}

export interface PlanAnalyzer {
  /**
   * Raw model output, unparsed. The analyzer gets no tools; the use case
   * parses and validates whatever comes back.
   */
  analyze(input: AnalyzerInput): Promise<unknown>;
}

export interface DoneAction {
  index: number;
  /** null for skips. */
  url: string | null;
}

/** A validated plan saved before anything is filed, so a failed run resumes it. */
export interface PendingPlan {
  /** Random per plan; with the action index, it forms each action's provenance marker. */
  planId: string;
  plan: TriagePlan;
  /** What validatePlan checked the plan against. */
  context: { feedbackIds: string[]; issues: IssueRef[] };
  /** The cursor to store once every action is done. */
  advanceTo: Cursor;
  done: DoneAction[];
}

export interface TriageLedger {
  /**
   * Takes the exclusive run lock. Returns false if another live run holds it.
   * A real run holds it from start to finish.
   */
  acquireLock(): Promise<boolean>;
  /** Releases the lock if this process holds it. */
  releaseLock(): Promise<void>;
  getCursor(): Promise<Cursor | null>;
  getPendingPlan(): Promise<PendingPlan | null>;
  savePendingPlan(pending: PendingPlan): Promise<void>;
  markActionDone(index: number, url: string | null): Promise<void>;
  /** Drops the pending plan and stores the new cursor, together. */
  clearPending(advanceTo: Cursor): Promise<void>;
}

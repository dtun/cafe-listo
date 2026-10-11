import type { NewFeedback } from "@cafe-listo/shared";

/** Optional fields as storage returns them: present, but possibly null. */
type Stored<T> = {
  [K in keyof T]-?: undefined extends T[K]
    ? Exclude<T[K], undefined> | null
    : T[K];
};

/**
 * A feedback row as read from storage, derived from the shared NewFeedback so
 * a field added there shows up here. `userId` never leaves the reader's caller.
 */
export type FeedbackRecord = Stored<Omit<NewFeedback, "createdAt">> & {
  /** Fixed-width UTC timestamp; with `id`, the cursor value. */
  createdAt: string;
};

/** A feedback row the analyzer may see: the user id is replaced by a per-run alias. */
export type Feedback = Omit<FeedbackRecord, "userId"> & { reporter: string };

export interface TriagePolicy {
  allowedLabels: string[];
  requiredLabels: string[];
  /** Caps non-skip actions overall, and creates on their own. */
  maxActions: number;
  maxComments: number;
  /** Logins whose issues the loop may comment on (besides issues labelled `feedback`). */
  trustedAuthors: string[];
  /** Whole-title pattern; a named `scope` group must be one of `scopes`. */
  titlePattern: RegExp;
  scopes: string[];
}

export interface IssueRef {
  number: number;
  state: "OPEN" | "CLOSED";
  author: string;
  labels: string[];
}

export interface PlanContext {
  /** Every feedback id the analyzer was shown. */
  feedbackIds: string[];
  /** Every issue the analyzer was shown. */
  issues: IssueRef[];
  policy: TriagePolicy;
}

export interface Problem {
  rule: string;
  message: string;
}

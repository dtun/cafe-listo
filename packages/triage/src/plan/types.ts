import type { FeedbackKind } from "@cafe-listo/shared";

/** A feedback row as read from storage. `userId` never leaves the reader's caller. */
export interface FeedbackRecord {
  id: string;
  userId: string;
  kind: FeedbackKind;
  summary: string;
  details: string | null;
  toolName: string | null;
  itemId: string | null;
  userQuote: string | null;
  /** Fixed-width UTC timestamp; also the cursor value. */
  createdAt: string;
}

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

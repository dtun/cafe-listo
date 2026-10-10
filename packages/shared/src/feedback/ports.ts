export type FeedbackKind = "gap" | "bug" | "content_error" | "idea" | "other";

/** One piece of feedback, submitted with the user's consent. */
export interface NewFeedback {
  id: string;
  /** Always the verified caller, never taken from tool arguments. */
  userId: string;
  kind: FeedbackKind;
  summary: string;
  details?: string;
  toolName?: string;
  itemId?: string;
  /** The user's own words. */
  userQuote?: string;
  createdAt: Date;
}

/** Write-only persistence port: users can submit feedback but never read it back. */
export interface FeedbackRepository {
  insert(feedback: NewFeedback): Promise<void>;
}

import type { FeedbackRepository, NewFeedback } from "@cafe-listo/shared";

/** Write-only, like the real table: users can insert feedback but never read it back. */
export class InMemoryFeedbackRepository implements FeedbackRepository {
  /** Test inspection only; the port exposes no reads. */
  readonly rows: NewFeedback[] = [];

  async insert(feedback: NewFeedback): Promise<void> {
    this.rows.push({ ...feedback });
  }
}

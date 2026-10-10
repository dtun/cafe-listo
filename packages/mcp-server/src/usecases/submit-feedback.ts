import type { FeedbackKind, FeedbackRepository } from "@cafe-listo/shared";
import { ok, type Clock, type IdGenerator, type UseCaseResult } from "./types";

export interface SubmitFeedbackInput {
  userId: string;
  kind: FeedbackKind;
  summary: string;
  details?: string;
  toolName?: string;
  itemId?: string;
  userQuote?: string;
}

export class SubmitFeedback {
  constructor(
    private readonly repo: FeedbackRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** The id is minted here because users can't read rows back to learn a DB-generated one. */
  async execute(
    input: SubmitFeedbackInput,
  ): Promise<UseCaseResult<{ id: string; receivedAt: Date }>> {
    const id = this.ids.next();
    const receivedAt = this.clock.now();
    await this.repo.insert({ ...input, id, createdAt: receivedAt });
    return ok({ id, receivedAt });
  }
}

import type { ChecklistRepository } from "@cafe-listo/shared";
import { ok, type UseCaseResult } from "./types";

export class ResetChecklist {
  constructor(private readonly repo: ChecklistRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<UseCaseResult<{ reset: true }>> {
    await this.repo.reset(input.userId);
    return ok({ reset: true });
  }
}

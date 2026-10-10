import type { ChecklistRepository } from "@cafe-listo/shared";
import {
  fail,
  ok,
  type Catalog,
  type Clock,
  type UseCaseResult,
} from "./types";

export interface SetItemDoneInput {
  userId: string;
  itemId: string;
  done: boolean;
}

export class SetItemDone {
  constructor(
    private readonly repo: ChecklistRepository,
    private readonly catalog: Catalog,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SetItemDoneInput,
  ): Promise<UseCaseResult<{ itemId: string; done: boolean }>> {
    if (!this.catalog.items.some((item) => item.id === input.itemId)) {
      return fail("not_found", `Item not found: ${input.itemId}`);
    }
    await this.repo.setDone(
      input.userId,
      input.itemId,
      input.done,
      this.clock.now(),
    );
    return ok({ itemId: input.itemId, done: input.done });
  }
}

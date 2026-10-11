import { applyItemUpdate, type ChecklistRepository } from "@cafe-listo/shared";
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

/**
 * Legacy shim over item status: done means packed, not done means needed.
 * Kept so clients built on set_item_done keep working; update_items is the
 * full version.
 */
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
    const existing = (await this.repo.getEntries(input.userId)).find(
      (entry) => entry.itemId === input.itemId,
    );
    const entry = applyItemUpdate(
      existing,
      { itemId: input.itemId, status: input.done ? "packed" : "needed" },
      this.clock.now(),
    );
    await this.repo.saveEntries(input.userId, [entry]);
    return ok({ itemId: input.itemId, done: input.done });
  }
}

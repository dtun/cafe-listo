import {
  applyItemUpdate,
  type ChecklistEntry,
  type ChecklistRepository,
  type ItemUpdate,
} from "@cafe-listo/shared";
import { fail, ok, type Clock, type UseCaseResult } from "./types";

export interface UpdateItemsInput {
  userId: string;
  updates: readonly ItemUpdate[];
}

/**
 * Batch status, quantity and expiry updates, written in one upsert. All or
 * nothing: an unknown or repeated item id rejects the batch before any write.
 * Idempotent: repeating a batch changes only `updatedAt` (see `applyItemUpdate`).
 */
export class UpdateItems {
  private readonly knownIds: ReadonlySet<string>;

  constructor(
    private readonly repo: ChecklistRepository,
    items: readonly { id: string }[],
    private readonly clock: Clock,
  ) {
    this.knownIds = new Set(items.map((item) => item.id));
  }

  async execute(
    input: UpdateItemsInput,
  ): Promise<UseCaseResult<ChecklistEntry[]>> {
    if (input.updates.length === 0) {
      return fail("unprocessable", "Send at least one item to update.");
    }

    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const { itemId } of input.updates) {
      if (seen.has(itemId)) repeated.add(itemId);
      seen.add(itemId);
    }
    if (repeated.size > 0) {
      return fail(
        "unprocessable",
        `Each item may appear once per call; repeated: ${[...repeated].join(", ")}. Merge their changes and send again.`,
      );
    }

    const unknown = [...seen].filter((id) => !this.knownIds.has(id));
    if (unknown.length > 0) {
      return fail(
        "not_found",
        `Unknown item ids: ${unknown.join(", ")}. Nothing was saved; use ids from get_tote.`,
      );
    }

    const existing = new Map(
      (await this.repo.getEntries(input.userId)).map((e) => [e.itemId, e]),
    );
    const now = this.clock.now();
    const entries = input.updates.map((update) =>
      applyItemUpdate(existing.get(update.itemId), update, now),
    );
    await this.repo.saveEntries(input.userId, entries);
    return ok(entries);
  }
}

import type { ChecklistEntry, ItemStatus } from "./ports";

/**
 * A change to one item. Omitted fields keep their stored value, except that
 * moving to `needed` clears `quantity` unless one is given.
 */
export interface ItemUpdate {
  itemId: string;
  status?: ItemStatus;
  /** Purchase units the user has. */
  quantity?: number;
  /** `YYYY-MM-DD`, or null to clear it. */
  expiresOn?: string | null;
}

/**
 * The entry after an update. Pure.
 *
 * - `packedAt` is set to `at` when the item moves to packed, kept while it
 *   stays packed, and cleared when it leaves packed. Repeating an update
 *   therefore changes nothing but `updatedAt`.
 * - An item with no entry starts as needed with nothing recorded.
 */
export function applyItemUpdate(
  existing: ChecklistEntry | undefined,
  update: ItemUpdate,
  at: Date,
): ChecklistEntry {
  const status = update.status ?? existing?.status ?? "needed";
  const quantity =
    update.quantity !== undefined
      ? update.quantity
      : update.status === "needed"
        ? null
        : (existing?.quantity ?? null);
  const packedAt =
    status !== "packed"
      ? null
      : existing?.status === "packed" && existing.packedAt
        ? existing.packedAt
        : at;

  return {
    itemId: update.itemId,
    status,
    quantity,
    packedAt,
    expiresOn:
      update.expiresOn !== undefined
        ? update.expiresOn
        : (existing?.expiresOn ?? null),
    updatedAt: at,
  };
}

/** Where an item is on its way into the tote. */
export const ITEM_STATUSES = ["needed", "bought", "packed"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** A user's stored state for one catalog item. Items without an entry are needed. */
export interface ChecklistEntry {
  itemId: string;
  status: ItemStatus;
  /** Purchase units the user has, or null when not recorded (read as the full amount). */
  quantity: number | null;
  /** When the item was last moved to packed; null unless `status` is packed. */
  packedAt: Date | null;
  /** Expiry from the label as `YYYY-MM-DD`, or null when unknown. */
  expiresOn: string | null;
  updatedAt: Date;
}

/** Persistence port for per-user checklists. Every operation is scoped to one user. */
export interface ChecklistRepository {
  getEntries(userId: string): Promise<ChecklistEntry[]>;
  /** Upserts whole entries keyed on item id, in one write. Saving the same entries twice is a no-op. */
  saveEntries(
    userId: string,
    entries: readonly ChecklistEntry[],
  ): Promise<void>;
  reset(userId: string): Promise<void>;
}

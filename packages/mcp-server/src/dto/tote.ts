import type { ChecklistEntry } from "@cafe-listo/shared";

/** Wire shape for update_items: what was saved for each item. */
export function updatedItemsDto(entries: readonly ChecklistEntry[]) {
  return {
    updated: entries.map((entry) => ({
      item_id: entry.itemId,
      status: entry.status,
      quantity: entry.quantity,
      packed_at: entry.packedAt?.toISOString() ?? null,
      expires_on: entry.expiresOn,
    })),
  };
}

import { statusOf, type ChecklistEntry } from "@cafe-listo/shared";
import type { ToteView } from "../usecases/get-tote";

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

/**
 * Wire shape for get_tote. Summary first, items last. Per-item overflow
 * warnings are left out because `tote.overflow` already lists them.
 */
export function toteDto(view: ToteView) {
  return {
    region: { id: view.region.id, name: view.region.name },
    readiness_percent: view.readinessPercent,
    counts: view.counts,
    tote: {
      container: view.container.name,
      planned_fill_percent: view.pack.fillPercent,
      planned_weight_kg: view.pack.weightKg,
      overflow: view.pack.overflow.map((line) => ({
        item_id: line.id,
        quantity: line.quantity,
        reason: line.reason,
        hint: line.hint,
      })),
      warnings: view.pack.warnings
        .filter((w) => w.code !== "overflow")
        .map((w) => w.message),
    },
    expiring: view.expiring.map((e) => ({
      item_id: e.item.id,
      name: e.item.name,
      expires_on: e.expiresOn,
      days_left: e.daysLeft,
      estimated: e.estimated,
    })),
    hazards: view.hazards,
    items: view.lines.map((line) => ({
      id: line.item.id,
      name: line.item.name,
      category_id: line.item.categoryId,
      essential: line.item.essential,
      status: statusOf(line),
      units: line.item.units,
      purchase_unit: line.item.purchaseUnit,
      quantity: line.entry?.quantity ?? null,
      buy_at: line.item.buyAt,
    })),
  };
}

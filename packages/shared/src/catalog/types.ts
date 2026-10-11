import type { SourceId } from "../data/sources";
import type { Hazard } from "../data/fema-regions";
import type { QuantityRule } from "../household/types";
import type { PrepItem } from "../types";

export const STORE_CATEGORIES = [
  "online",
  "hardware",
  "grocery",
  "pharmacy",
  "pet",
] as const;

/** The kind of store that sells an item. Never a brand or a retailer. */
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

/**
 * When an item belongs in a kit: `"base"` for every kit, or a list of
 * hazards, in which case the item is added only where the region faces at
 * least one of them.
 */
export type AppliesTo = "base" | readonly [Hazard, ...Hazard[]];

/**
 * A checklist item with what the catalog needs to size, pack and shop for
 * it. Extends `PrepItem` additively, so every catalog item is still a valid
 * checklist item and saved checklists keep working by id.
 *
 * Volumes, weights and shelf lives are rough planning figures, not sourced
 * numbers. `sourceIds` back the item itself (why it is in a kit).
 */
export interface CatalogItem extends PrepItem {
  appliesTo: AppliesTo;
  /** How many purchase units a household needs. See `scale`. */
  quantityRule: QuantityRule;
  /** The unit `quantityRule.amount` is in, e.g. "gallon". */
  unit: string;
  /** What one purchasable unit is, e.g. "1-gallon jug". `packSize` units of `unit` make one. */
  purchaseUnit: string;
  /** Approximate volume of one purchase unit (L). */
  unitVolumeL: number;
  /** Approximate weight of one purchase unit (kg). */
  unitWeightKg: number;
  /** False for things that belong beside the tote, such as bulk water. */
  packable: boolean;
  /** Months before it should be replaced, or null if it does not expire. */
  shelfLifeMonths: number | null;
  /** Where to buy it, or null for things you make or gather (copies, cash, a plan). */
  buyAt: StoreCategory | null;
  /** Generic search phrase with no brand, or null when `buyAt` is null. */
  searchTerm: string | null;
  /** At least one source backs every item. */
  sourceIds: readonly [SourceId, ...SourceId[]];
}

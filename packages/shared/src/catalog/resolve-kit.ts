import {
  getRegion,
  type FemaRegion,
  type FemaRegionId,
  type Hazard,
  type HazardRelevance,
  type StateCode,
} from "../data/fema-regions";
import { regionNotesFor } from "../data/region-notes";
import { scale } from "../household/scale";
import type { Household } from "../household/types";
import { CATEGORIES } from "../seed-data";
import type { PackItem } from "../tote/pack-tote";
import { CATALOG_ITEMS } from "./items";
import type { CatalogItem } from "./types";

/**
 * Why an item is in a kit: `"base"` for every kit, or the strongest
 * relevance among the region's hazards that the item applies to.
 */
export type ItemRelevance = "base" | HazardRelevance;

/** A catalog item sized for one household in one region. */
export interface ResolvedItem extends CatalogItem {
  /** Purchase units to buy (see `purchaseUnit`). Always 1 or more. */
  units: number;
  relevance: ItemRelevance;
  /** The region's hazards that brought this item in; empty for base items. */
  hazards: readonly Hazard[];
}

export interface ResolveKitOptions {
  /** Applies that state's region notes as well as the region-wide ones. */
  state?: StateCode;
  /** Defaults to `CATALOG_ITEMS`. */
  catalog?: readonly CatalogItem[];
}

/**
 * `hazardRelevance` that `toPackItems` gives `packTote` for each relevance.
 * Base and primary-hazard items rank together; secondary-hazard items pack
 * after them among items with the same `essential` value.
 */
export const RELEVANCE_WEIGHT: Readonly<Record<ItemRelevance, number>> = {
  base: 1,
  primary: 1,
  secondary: 0.5,
};

const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id, i]));

/**
 * The kit for a household in a FEMA region: every base item, plus the items
 * for the region's hazards, each scaled to the household.
 *
 * - Items that scale to 0 are left out (no infants means no diapers; a
 *   conditional item without its flag is left out).
 * - `essential` is the item's own flag; `relevance` says why it is here.
 * - `regionNote` comes from the region's overlays (and `state`'s, if given).
 * - Results are in category order, then catalog order. Pure.
 */
export function resolveKit(
  region: FemaRegionId | FemaRegion,
  household: Household,
  options: ResolveKitOptions = {},
): ResolvedItem[] {
  const { hazards } = typeof region === "number" ? getRegion(region) : region;
  const regionId = typeof region === "number" ? region : region.id;
  const relevanceOf = new Map(hazards.map((h) => [h.hazard, h.relevance]));
  const notes = regionNotesFor(regionId, options.state);

  const resolved: ResolvedItem[] = [];
  for (const item of options.catalog ?? CATALOG_ITEMS) {
    const matched =
      item.appliesTo === "base"
        ? []
        : item.appliesTo.filter((hazard) => relevanceOf.has(hazard));
    if (item.appliesTo !== "base" && matched.length === 0) continue;

    const units = scale(item.quantityRule, household);
    if (units === 0) continue;

    resolved.push({
      ...item,
      regionNote: notes[item.id] ?? null,
      units,
      relevance:
        item.appliesTo === "base"
          ? "base"
          : matched.some((hazard) => relevanceOf.get(hazard) === "primary")
            ? "primary"
            : "secondary",
      hazards: matched,
    });
  }

  return resolved
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (CATEGORY_ORDER.get(a.item.categoryId) ?? 0) -
          (CATEGORY_ORDER.get(b.item.categoryId) ?? 0) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/** The `packTote` input for a resolved kit. */
export function toPackItems(items: readonly ResolvedItem[]): PackItem[] {
  return items.map((item) => ({
    id: item.id,
    quantity: item.units,
    unitVolumeL: item.unitVolumeL,
    unitWeightKg: item.unitWeightKg,
    packable: item.packable,
    essential: item.essential,
    hazardRelevance: RELEVANCE_WEIGHT[item.relevance],
  }));
}

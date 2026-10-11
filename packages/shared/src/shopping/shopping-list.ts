import { STORE_CATEGORIES, type StoreCategory } from "../catalog/types";
import type { Hazard } from "../data/fema-regions";
import type { SourceId } from "../data/sources";
import { HDX_27_GAL_TOTE, type Container } from "../tote/container";
import { statusOf, type ToteLine } from "../tote/progress";
import { storeSearchUrl } from "./store-search";

/**
 * How to buy a container. Containers are not catalog items (the kit goes in
 * them), so the shopping fields live here, keyed by container id.
 */
export interface ContainerPurchase {
  store: StoreCategory;
  purchaseUnit: string;
  /** Generic, with no brand, like a catalog item's `searchTerm`. */
  searchTerm: string;
  sourceIds: readonly [SourceId, ...SourceId[]];
}

export const CONTAINER_PURCHASES: Readonly<Record<string, ContainerPurchase>> =
  {
    [HDX_27_GAL_TOTE.id]: {
      store: "hardware",
      purchaseUnit: "1 tote with lid",
      searchTerm: "27 gallon storage tote with lid",
      sourceIds: ["hd-hdx-27gal-tote"],
    },
  };

/** One thing to buy, in purchase units. */
export interface ShoppingLine {
  /** Catalog item id, or the container id for the tote. */
  id: string;
  name: string;
  store: StoreCategory;
  /** Purchase units still to buy. Always 1 or more. */
  quantity: number;
  /** Purchase units the user already has (0 when none are recorded). */
  have: number;
  purchaseUnit: string;
  searchTerm: string;
  searchUrl: string;
  essential: boolean;
  /** The region's hazards that brought the item into the kit. */
  hazards: readonly Hazard[];
  sourceIds: readonly SourceId[];
  /** True only for the tote itself. */
  tote: boolean;
}

export interface StoreGroup {
  store: StoreCategory;
  lines: ShoppingLine[];
}

/** A kit item left off the shopping lines, with how many units it still needs. */
export interface UnlistedItem {
  id: string;
  name: string;
  quantity: number;
  sourceIds: readonly SourceId[];
}

export interface ShoppingList {
  /**
   * Lines grouped by store. The tote's group comes first with the tote as
   * its first line; the other groups follow in `STORE_CATEGORIES` order.
   * Within a group, lines keep kit order. Empty groups are left out.
   */
  groups: StoreGroup[];
  /** Still needed but not bought: things you make or gather (`buyAt` null). */
  gather: UnlistedItem[];
  /** Budget mode only: optional items to buy after the essentials. */
  later: UnlistedItem[];
  /** Kit items with nothing left to get. */
  done: number;
}

export interface ShoppingListOptions {
  /** The container the kit goes in; added as line 1 unless `hasTote`. */
  container: Container;
  hasTote: boolean;
  /** Puts every line in this store's group, e.g. everything online. */
  storePreference?: StoreCategory;
  /**
   * Essentials first: only essential items (and the tote) become lines;
   * every other item still to buy goes to `later`. Items to gather are
   * listed either way.
   */
  budgetMode?: boolean;
}

/**
 * Purchase units of an item the user has. A recorded quantity always wins.
 * Without one, a bought or packed item counts as the full `units` (the
 * same reading as readiness) and a needed item counts as none.
 */
export function unitsHave(line: ToteLine): number {
  const recorded = line.entry?.quantity;
  if (recorded !== null && recorded !== undefined) return recorded;
  return statusOf(line) === "needed" ? 0 : line.item.units;
}

/** Purchase units of an item still to get, 0 or more. */
export function unitsToBuy(line: ToteLine): number {
  return Math.max(0, line.item.units - unitsHave(line));
}

/**
 * Whether the user has a tote when they have not said: they do once any
 * item is packed, because packing means putting it in the tote.
 */
export function inferHasTote(lines: readonly ToteLine[]): boolean {
  return lines.some((line) => statusOf(line) === "packed");
}

/**
 * The shopping list for a kit: every item minus what the user already has,
 * grouped by where to buy it, with the tote as line 1 when the user has none.
 * Pure.
 *
 * @throws Error if the container has no entry in `CONTAINER_PURCHASES`.
 */
export function buildShoppingList(
  lines: readonly ToteLine[],
  options: ShoppingListOptions,
): ShoppingList {
  const { container, storePreference, budgetMode = false } = options;
  const toBuy: ShoppingLine[] = [];
  const gather: UnlistedItem[] = [];
  const later: UnlistedItem[] = [];
  let done = 0;

  if (!options.hasTote) {
    const purchase = CONTAINER_PURCHASES[container.id];
    if (!purchase) {
      throw new Error(`No purchase details for container ${container.id}`);
    }
    const store = storePreference ?? purchase.store;
    toBuy.push({
      id: container.id,
      name: container.name,
      store,
      quantity: 1,
      have: 0,
      purchaseUnit: purchase.purchaseUnit,
      searchTerm: purchase.searchTerm,
      searchUrl: storeSearchUrl(store, purchase.searchTerm),
      essential: true,
      hazards: [],
      sourceIds: purchase.sourceIds,
      tote: true,
    });
  }

  for (const line of lines) {
    const { item } = line;
    const quantity = unitsToBuy(line);
    if (quantity === 0) {
      done += 1;
      continue;
    }
    const unlisted: UnlistedItem = {
      id: item.id,
      name: item.name,
      quantity,
      sourceIds: item.sourceIds,
    };
    if (item.buyAt === null || item.searchTerm === null) {
      gather.push(unlisted);
      continue;
    }
    if (budgetMode && !item.essential) {
      later.push(unlisted);
      continue;
    }
    const store = storePreference ?? item.buyAt;
    toBuy.push({
      id: item.id,
      name: item.name,
      store,
      quantity,
      have: unitsHave(line),
      purchaseUnit: item.purchaseUnit,
      searchTerm: item.searchTerm,
      searchUrl: storeSearchUrl(store, item.searchTerm),
      essential: item.essential,
      hazards: item.hazards,
      sourceIds: item.sourceIds,
      tote: false,
    });
  }

  return { groups: groupByStore(toBuy), gather, later, done };
}

function groupByStore(lines: readonly ShoppingLine[]): StoreGroup[] {
  const toteStore = lines.find((line) => line.tote)?.store;
  const order = toteStore
    ? [toteStore, ...STORE_CATEGORIES.filter((s) => s !== toteStore)]
    : STORE_CATEGORIES;
  return order
    .map((store) => ({
      store,
      lines: lines.filter((line) => line.store === store),
    }))
    .filter((group) => group.lines.length > 0);
}

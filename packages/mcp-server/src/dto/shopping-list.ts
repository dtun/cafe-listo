import {
  getSource,
  type OverflowReason,
  type ShoppingLine,
  type SourceId,
  type UnlistedItem,
} from "@cafe-listo/shared";
import type { ShoppingListView } from "../usecases/build-shopping-list";

/** Why units of an item live beside the tote, in words for the user. */
const BESIDE_TOTE_WHY: Readonly<Record<OverflowReason, string>> = {
  "not-packable": "Meant to be stored beside the tote, not in it.",
  "no-space": "No room left in the tote for these units.",
};

/**
 * Wire shape for build_shopping_list. Kept short for chat: lines cite
 * source ids and `sources` resolves each id once; `have` and `hazards`
 * appear on a line only when they say something.
 */
export function shoppingListDto(view: ShoppingListView) {
  const { list, pack } = view;
  const names = new Map(view.kit.map((item) => [item.id, item.name]));
  const cited = new Set<SourceId>();
  const cite = (ids: readonly SourceId[]) => {
    for (const id of ids) cited.add(id);
    return ids;
  };

  const lineDto = (line: ShoppingLine) => ({
    item_id: line.id,
    name: line.name,
    quantity: line.quantity,
    purchase_unit: line.purchaseUnit,
    ...(line.have > 0 ? { have: line.have } : {}),
    essential: line.essential,
    search_term: line.searchTerm,
    url: line.searchUrl,
    ...(line.hazards.length > 0 ? { hazards: line.hazards } : {}),
    sources: cite(line.sourceIds),
  });
  const unlistedDto = (item: UnlistedItem) => ({
    item_id: item.id,
    name: item.name,
    quantity: item.quantity,
    sources: cite(item.sourceIds),
  });

  const stores = list.groups.map((group) => ({
    store: group.store,
    lines: group.lines.map(lineDto),
  }));
  const gather = list.gather.map(unlistedDto);
  const later = list.later.map(unlistedDto);
  const hazards = view.region.hazards.map((h) => ({
    hazard: h.hazard,
    relevance: h.relevance,
    sources: cite(h.sources),
  }));

  return {
    region: { id: view.region.id, name: view.region.name },
    days: view.days,
    has_tote: view.hasTote,
    has_tote_inferred: view.hasToteInferred,
    store_preference: view.storePreference,
    budget_mode: view.budgetMode,
    counts: {
      lines: stores.reduce((n, s) => n + s.lines.length, 0),
      gather: gather.length,
      later: later.length,
      done: list.done,
    },
    stores,
    gather,
    later,
    fit: {
      container: view.container.name,
      fill_percent: pack.fillPercent,
      weight_kg: pack.weightKg,
      in_tote: pack.fits.map((line) => line.id),
      beside_tote: pack.overflow.map((line) => ({
        item_id: line.id,
        name: names.get(line.id) ?? line.id,
        quantity: line.quantity,
        reason: line.reason,
        why: BESIDE_TOTE_WHY[line.reason],
      })),
      warnings: pack.warnings
        .filter((w) => w.code !== "overflow")
        .map((w) => w.message),
    },
    hazards,
    sources: Object.fromEntries(
      [...cited].map((id) => {
        const source = getSource(id);
        return [id, { title: source.title, url: source.url }];
      }),
    ),
  };
}

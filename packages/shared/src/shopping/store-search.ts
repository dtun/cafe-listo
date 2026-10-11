import type { StoreCategory } from "../catalog/types";

/**
 * One plain search URL per store category, with `{q}` standing for the
 * URL-encoded search term. This is the only place store links are built.
 *
 * PROVISIONAL and deliberately retailer-neutral until the retailer decision
 * issue picks stores: no retailer, no affiliate tags, no tracking
 * parameters, no prices and no scraping. The link is built from the item's
 * generic search term and nothing else.
 *
 * - `online`: a shopping search, for things usually bought online.
 * - Every in-store category: a map search for the term, which finds nearby
 *   stores of any brand that carry it.
 */
export const STORE_SEARCH_URL_TEMPLATES: Readonly<
  Record<StoreCategory, string>
> = {
  online: "https://www.google.com/search?tbm=shop&q={q}",
  hardware: "https://www.google.com/maps/search/?api=1&query={q}",
  grocery: "https://www.google.com/maps/search/?api=1&query={q}",
  pharmacy: "https://www.google.com/maps/search/?api=1&query={q}",
  pet: "https://www.google.com/maps/search/?api=1&query={q}",
};

/** The search URL for `searchTerm` at a kind of store. */
export function storeSearchUrl(
  store: StoreCategory,
  searchTerm: string,
): string {
  return STORE_SEARCH_URL_TEMPLATES[store].replace(
    "{q}",
    encodeURIComponent(searchTerm.trim()),
  );
}

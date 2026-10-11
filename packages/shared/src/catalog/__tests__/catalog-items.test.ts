import { SOURCES } from "../../data/sources";
import { HAZARD_SOURCES } from "../../data/fema-regions";
import { BASE_PREP_ITEMS, CATEGORIES, PREP_ITEMS } from "../../seed-data";
import { ADDED_CATALOG_ITEMS, CATALOG_ITEMS } from "../items";
import { STORE_CATEGORIES } from "../types";

const LEGACY_IDS = [
  ...["water-1", "water-2", "water-3", "water-4", "water-5"],
  ...["food-1", "food-2", "food-3", "food-4", "food-5", "food-6", "food-7"],
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `medical-${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `shelter-${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `tools-${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `comms-${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `documents-${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `morale-${n}`),
];

describe("catalog items", () => {
  test("keeps every original checklist id, in order", () => {
    expect(BASE_PREP_ITEMS.map((i) => i.id)).toEqual(LEGACY_IDS);
    expect(PREP_ITEMS.map((i) => i.id)).toEqual(LEGACY_IDS);
  });

  test("additions are not in the legacy checklist", () => {
    const legacy = new Set(LEGACY_IDS);
    for (const item of ADDED_CATALOG_ITEMS) {
      expect(legacy.has(item.id)).toBe(false);
    }
  });

  test("ids are unique and follow category-N", () => {
    const ids = CATALOG_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CATALOG_ITEMS) {
      expect(item.id).toMatch(new RegExp(`^${item.categoryId}-\\d+$`));
    }
  });

  test("every category is known", () => {
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const item of CATALOG_ITEMS) {
      expect(categories.has(item.categoryId)).toBe(true);
    }
  });

  test("every item has at least one known source id", () => {
    const known = new Set<string>(SOURCES.map((s) => s.id));
    for (const item of CATALOG_ITEMS) {
      expect(item.sourceIds.length).toBeGreaterThan(0);
      for (const id of item.sourceIds) {
        expect(known.has(id)).toBe(true);
      }
    }
  });

  test("hazard lists name known hazards, with no duplicates", () => {
    const hazards = new Set(Object.keys(HAZARD_SOURCES));
    for (const item of CATALOG_ITEMS) {
      if (item.appliesTo === "base") continue;
      expect(item.appliesTo.length).toBeGreaterThan(0);
      expect(new Set(item.appliesTo).size).toBe(item.appliesTo.length);
      for (const hazard of item.appliesTo) {
        expect(hazards.has(hazard)).toBe(true);
      }
    }
  });

  test("volumes, weights and shelf lives are sane", () => {
    for (const item of CATALOG_ITEMS) {
      expect(item.unitVolumeL).toBeGreaterThan(0);
      expect(item.unitWeightKg).toBeGreaterThan(0);
      if (item.shelfLifeMonths !== null) {
        expect(Number.isInteger(item.shelfLifeMonths)).toBe(true);
        expect(item.shelfLifeMonths).toBeGreaterThan(0);
      }
    }
  });

  test("bought items have a store category and a search term", () => {
    for (const item of CATALOG_ITEMS) {
      if (item.buyAt === null) {
        expect(item.searchTerm).toBeNull();
      } else {
        expect(STORE_CATEGORIES).toContain(item.buyAt);
        expect(item.searchTerm?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("search terms name no brands", () => {
    for (const item of CATALOG_ITEMS) {
      expect(item.searchTerm ?? "").not.toMatch(/bustelo|hdx|®|™/i);
    }
  });

  test("covers the hazard items the research calls for", () => {
    const byId = new Map(CATALOG_ITEMS.map((i) => [i.id, i]));
    expect(byId.get("shelter-3")?.appliesTo).toEqual(["wildfire", "volcano"]);
    expect(byId.get("tools-8")?.appliesTo).toEqual(["earthquake"]);
    expect(byId.get("comms-1")?.appliesTo).toBe("base");
    expect(byId.get("food-2")?.appliesTo).toBe("base");
  });
});

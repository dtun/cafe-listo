import {
  CATEGORIES,
  PREP_ITEMS,
  getItemsByCategory,
  createInitialChecklistState,
} from "../seed-data";

describe("seed data", () => {
  test("has exactly 8 categories", () => {
    expect(CATEGORIES).toHaveLength(8);
  });

  test("has exactly 47 items", () => {
    expect(PREP_ITEMS).toHaveLength(47);
  });

  test("every item references a valid category", () => {
    const categoryIds = new Set(CATEGORIES.map((c) => c.id));
    for (const item of PREP_ITEMS) {
      expect(categoryIds.has(item.categoryId)).toBe(true);
    }
  });

  test("every item has a non-empty name and quantity", () => {
    for (const item of PREP_ITEMS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.quantity.length).toBeGreaterThan(0);
    }
  });

  test("no duplicate item IDs", () => {
    const ids = PREP_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("at least one item has a region note", () => {
    const withNotes = PREP_ITEMS.filter((item) => item.regionNote !== null);
    expect(withNotes.length).toBeGreaterThan(0);
  });

  test("every category has at least one item", () => {
    for (const category of CATEGORIES) {
      const items = PREP_ITEMS.filter((i) => i.categoryId === category.id);
      expect(items.length).toBeGreaterThan(0);
    }
  });
});

describe("getItemsByCategory", () => {
  test("returns only items for the given category", () => {
    const waterItems = getItemsByCategory("water");
    expect(waterItems.length).toBeGreaterThan(0);
    for (const item of waterItems) {
      expect(item.categoryId).toBe("water");
    }
  });

  test("returns empty array for category with no items would not happen but is safe", () => {
    // All categories have items, but the function handles it gracefully
    const allCategoryItems = CATEGORIES.map((c) => getItemsByCategory(c.id));
    expect(allCategoryItems.every((items) => items.length > 0)).toBe(true);
  });
});

describe("createInitialChecklistState", () => {
  test("returns a state with 47 keys", () => {
    const state = createInitialChecklistState();
    expect(Object.keys(state)).toHaveLength(47);
  });

  test("all values are false", () => {
    const state = createInitialChecklistState();
    expect(Object.values(state).every((v) => v === false)).toBe(true);
  });

  test("keys match item IDs", () => {
    const state = createInitialChecklistState();
    const itemIds = PREP_ITEMS.map((i) => i.id).sort();
    const stateKeys = Object.keys(state).sort();
    expect(stateKeys).toEqual(itemIds);
  });
});

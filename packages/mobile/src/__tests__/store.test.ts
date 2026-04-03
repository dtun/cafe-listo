import { createChecklistStore } from "../store";
import { PREP_ITEMS } from "@cafe-listo/shared";

describe("createChecklistStore", () => {
  test("creates a store with a checklist table", () => {
    const store = createChecklistStore();
    const table = store.getTable("checklist");
    expect(table).toBeDefined();
    expect(Object.keys(table)).not.toHaveLength(0);
  });

  test("initializes all 47 prep items as rows", () => {
    const store = createChecklistStore();
    const table = store.getTable("checklist");
    expect(Object.keys(table)).toHaveLength(PREP_ITEMS.length);
  });

  test("each row has done: false", () => {
    const store = createChecklistStore();
    for (const item of PREP_ITEMS) {
      expect(store.getCell("checklist", item.id, "done")).toBe(false);
    }
  });

  test("row IDs match prep item IDs", () => {
    const store = createChecklistStore();
    const rowIds = store.getRowIds("checklist");
    const itemIds = PREP_ITEMS.map((item) => item.id);
    expect(rowIds.sort()).toEqual(itemIds.sort());
  });
});

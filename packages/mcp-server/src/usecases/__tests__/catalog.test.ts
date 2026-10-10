import { describe, expect, it } from "vitest";
import { CATEGORIES, PREP_ITEMS } from "@cafe-listo/shared";
import { ListCategories } from "../list-categories";
import { ListItems } from "../list-items";

describe("ListCategories", () => {
  it("returns every category", async () => {
    const result = await new ListCategories(CATEGORIES).execute();

    expect(result).toEqual({ ok: true, data: CATEGORIES });
  });
});

describe("ListItems", () => {
  const listItems = new ListItems(PREP_ITEMS);

  it("returns the whole catalog with no filters", async () => {
    const result = await listItems.execute({});

    expect(result.ok && result.data).toHaveLength(PREP_ITEMS.length);
  });

  it("filters by category", async () => {
    const result = await listItems.execute({ categoryId: "water" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((i) => i.categoryId === "water")).toBe(true);
  });

  it("filters to essentials", async () => {
    const result = await listItems.execute({ essentialOnly: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.every((i) => i.essential)).toBe(true);
    expect(result.data.length).toBe(
      PREP_ITEMS.filter((i) => i.essential).length,
    );
  });
});

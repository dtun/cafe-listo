import { CATALOG_ITEMS } from "../../catalog/items";
import type { ResolvedItem } from "../../catalog/resolve-kit";
import type { ChecklistEntry } from "../../checklist/ports";
import { getSource } from "../../data/sources";
import { HDX_27_GAL_TOTE } from "../../tote/container";
import type { ToteLine } from "../../tote/progress";
import {
  buildShoppingList,
  CONTAINER_PURCHASES,
  inferHasTote,
  unitsHave,
  unitsToBuy,
  type ShoppingListOptions,
} from "../shopping-list";
import { storeSearchUrl, STORE_SEARCH_URL_TEMPLATES } from "../store-search";

const T0 = new Date("2026-01-15T12:00:00Z");

function item(id: string, overrides: Partial<ResolvedItem> = {}): ResolvedItem {
  const base = CATALOG_ITEMS.find((i) => i.id === id);
  if (!base) throw new Error(`no catalog item ${id}`);
  return { ...base, units: 1, relevance: "base", hazards: [], ...overrides };
}

function entry(
  itemId: string,
  overrides: Partial<ChecklistEntry> = {},
): ChecklistEntry {
  return {
    itemId,
    status: "packed",
    quantity: null,
    packedAt: T0,
    expiresOn: null,
    updatedAt: T0,
    ...overrides,
  };
}

const line = (
  id: string,
  units = 1,
  e?: Partial<ChecklistEntry>,
  overrides: Partial<ResolvedItem> = {},
): ToteLine => ({
  item: item(id, { units, ...overrides }),
  entry: e ? entry(id, e) : undefined,
});

const defaults: ShoppingListOptions = {
  container: HDX_27_GAL_TOTE,
  hasTote: true,
};

const ids = (list: ReturnType<typeof buildShoppingList>) =>
  list.groups.flatMap((g) => g.lines.map((l) => l.id));

describe("unitsHave and unitsToBuy", () => {
  it("counts nothing for a needed item with no quantity", () => {
    const l = line("water-1", 6);
    expect(unitsHave(l)).toBe(0);
    expect(unitsToBuy(l)).toBe(6);
  });

  it("counts a bought or packed item with no quantity as complete", () => {
    expect(unitsToBuy(line("water-1", 6, { status: "bought" }))).toBe(0);
    expect(unitsToBuy(line("water-1", 6, { status: "packed" }))).toBe(0);
  });

  it("subtracts a recorded quantity whatever the status", () => {
    expect(
      unitsToBuy(line("water-1", 6, { status: "packed", quantity: 2 })),
    ).toBe(4);
    expect(
      unitsToBuy(line("water-1", 6, { status: "bought", quantity: 5 })),
    ).toBe(1);
    expect(
      unitsToBuy(line("water-1", 6, { status: "needed", quantity: 1 })),
    ).toBe(5);
  });

  it("never goes below 0", () => {
    expect(
      unitsToBuy(line("water-1", 6, { status: "packed", quantity: 10 })),
    ).toBe(0);
  });
});

describe("inferHasTote", () => {
  it("is true once anything is packed", () => {
    expect(inferHasTote([line("water-1"), line("water-2")])).toBe(false);
    expect(
      inferHasTote([line("water-1", 1, { status: "bought" }), line("water-2")]),
    ).toBe(false);
    expect(inferHasTote([line("water-1", 1, { status: "packed" })])).toBe(true);
  });
});

describe("buildShoppingList", () => {
  it("lists what is left in purchase units with a search term and url", () => {
    const list = buildShoppingList(
      [
        line("water-1", 6, { status: "packed", quantity: 2 }),
        line("water-2", 1, { status: "packed" }),
      ],
      defaults,
    );

    expect(list.done).toBe(1);
    expect(list.groups).toEqual([
      {
        store: "grocery",
        lines: [
          {
            id: "water-1",
            name: expect.any(String),
            store: "grocery",
            quantity: 4,
            have: 2,
            purchaseUnit: "1-gallon jug",
            searchTerm: "1 gallon drinking water jug",
            searchUrl: storeSearchUrl("grocery", "1 gallon drinking water jug"),
            essential: true,
            hazards: [],
            sourceIds: expect.arrayContaining(["ready-water"]),
            tote: false,
          },
        ],
      },
    ]);
  });

  it("groups by store in store order, keeping kit order within a group", () => {
    const list = buildShoppingList(
      [
        line("water-1"),
        line("water-2"),
        line("food-10"),
        line("shelter-9"),
        line("tools-9"),
      ],
      defaults,
    );

    expect(list.groups.map((g) => [g.store, g.lines.map((l) => l.id)])).toEqual(
      [
        ["online", ["shelter-9"]],
        ["hardware", ["tools-9"]],
        ["grocery", ["water-1"]],
        ["pharmacy", ["water-2"]],
        ["pet", ["food-10"]],
      ],
    );
  });

  it("puts the tote first when the user has none", () => {
    const list = buildShoppingList([line("water-1"), line("shelter-9")], {
      ...defaults,
      hasTote: false,
    });

    const [first] = list.groups;
    expect(first.store).toBe(CONTAINER_PURCHASES[HDX_27_GAL_TOTE.id].store);
    expect(first.lines[0]).toMatchObject({
      id: HDX_27_GAL_TOTE.id,
      quantity: 1,
      tote: true,
      essential: true,
      sourceIds: ["hd-hdx-27gal-tote"],
    });
    expect(ids(list)).toEqual([HDX_27_GAL_TOTE.id, "shelter-9", "water-1"]);
  });

  it("keeps the tote's search term free of brands", () => {
    for (const purchase of Object.values(CONTAINER_PURCHASES)) {
      expect(purchase.searchTerm).not.toMatch(/hdx|home depot/i);
      for (const id of purchase.sourceIds) expect(getSource(id)).toBeDefined();
    }
  });

  it("moves every line, the tote included, to the preferred store", () => {
    const list = buildShoppingList(
      [line("water-1"), line("food-10"), line("tools-9")],
      { ...defaults, hasTote: false, storePreference: "online" },
    );

    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].store).toBe("online");
    expect(list.groups[0].lines[0].tote).toBe(true);
    for (const l of list.groups[0].lines) {
      expect(l.searchUrl).toBe(storeSearchUrl("online", l.searchTerm));
    }
  });

  it("lists things to make or gather apart from the store lines", () => {
    const gatherable = CATALOG_ITEMS.find((i) => i.buyAt === null);
    if (!gatherable) throw new Error("catalog needs an item with no store");

    const list = buildShoppingList(
      [line(gatherable.id, 2), line("water-1")],
      defaults,
    );

    expect(ids(list)).toEqual(["water-1"]);
    expect(list.gather).toEqual([
      {
        id: gatherable.id,
        name: gatherable.name,
        quantity: 2,
        sourceIds: gatherable.sourceIds,
      },
    ]);
  });

  it("in budget mode lists essentials and the tote, deferring the rest", () => {
    const gatherable = CATALOG_ITEMS.find(
      (i) => i.buyAt === null && !i.essential,
    );
    const lines = [
      line("water-1", 3, undefined, { essential: true }),
      line("tools-9", 1, undefined, { essential: false }),
      ...(gatherable ? [line(gatherable.id)] : []),
    ];

    const list = buildShoppingList(lines, {
      ...defaults,
      hasTote: false,
      budgetMode: true,
    });

    expect(ids(list)).toEqual([HDX_27_GAL_TOTE.id, "water-1"]);
    expect(list.later).toEqual([
      expect.objectContaining({ id: "tools-9", quantity: 1 }),
    ]);
    if (gatherable) {
      expect(list.gather.map((g) => g.id)).toEqual([gatherable.id]);
    }
  });

  it("is empty but for done when everything is in hand", () => {
    const list = buildShoppingList(
      [line("water-1", 2, { status: "packed" }), line("tools-9", 1, {})],
      defaults,
    );

    expect(list).toEqual({ groups: [], gather: [], later: [], done: 2 });
  });
});

describe("storeSearchUrl", () => {
  it("builds the url from the encoded search term only", () => {
    expect(storeSearchUrl("online", "ABC fire extinguisher")).toBe(
      "https://www.google.com/search?tbm=shop&q=ABC%20fire%20extinguisher",
    );
    expect(storeSearchUrl("pet", " cat litter 10 lb ")).toBe(
      "https://www.google.com/maps/search/?api=1&query=cat%20litter%2010%20lb",
    );
  });

  it("has one https template per store with no tracking or affiliate parameters", () => {
    for (const template of Object.values(STORE_SEARCH_URL_TEMPLATES)) {
      const url = new URL(template.replace("{q}", "x"));
      expect(url.protocol).toBe("https:");
      expect(template).not.toMatch(/utm_|affiliate|tag=|ref=/i);
      expect(template.match(/\{q\}/g)).toHaveLength(1);
    }
  });
});

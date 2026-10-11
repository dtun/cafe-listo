import { CATALOG_ITEMS } from "../../catalog/items";
import type { ResolvedItem } from "../../catalog/resolve-kit";
import type { ChecklistEntry } from "../../checklist/ports";
import type { HazardEntry } from "../../data/fema-regions";
import {
  addMonths,
  expiringSoon,
  expiryOf,
  hazardCoverage,
  packedFraction,
  readinessPercent,
  statusCounts,
  type ToteLine,
} from "../progress";

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

const essential = (id: string, units = 1) =>
  item(id, { essential: true, units });
const optional = (id: string, units = 1) =>
  item(id, { essential: false, units });

describe("packedFraction", () => {
  it("is 0 unless packed", () => {
    expect(packedFraction({ item: essential("water-1") })).toBe(0);
    expect(
      packedFraction({
        item: essential("water-1"),
        entry: entry("water-1", { status: "bought" }),
      }),
    ).toBe(0);
  });

  it("is 1 for a packed item with no recorded quantity", () => {
    expect(
      packedFraction({
        item: essential("water-1", 4),
        entry: entry("water-1"),
      }),
    ).toBe(1);
  });

  it("is quantity over units, capped at 1", () => {
    const item4 = essential("water-1", 4);
    expect(
      packedFraction({ item: item4, entry: entry("water-1", { quantity: 1 }) }),
    ).toBe(0.25);
    expect(
      packedFraction({ item: item4, entry: entry("water-1", { quantity: 9 }) }),
    ).toBe(1);
  });
});

describe("readinessPercent", () => {
  it("is 0 for an empty kit or nothing packed", () => {
    expect(readinessPercent([])).toBe(0);
    expect(readinessPercent([{ item: essential("water-1") }])).toBe(0);
  });

  it("weights essentials twice as much as other items", () => {
    const lines: ToteLine[] = [
      { item: essential("water-1"), entry: entry("water-1") },
      { item: optional("food-1") },
    ];
    // (2·1 + 1·0) / (2 + 1) = 66.7 → 66
    expect(readinessPercent(lines)).toBe(66);

    const flipped: ToteLine[] = [
      { item: essential("water-1") },
      { item: optional("food-1"), entry: entry("food-1") },
    ];
    // (2·0 + 1·1) / 3 = 33.3 → 33
    expect(readinessPercent(flipped)).toBe(33);
  });

  it("gives partial credit for a partly packed quantity", () => {
    const lines: ToteLine[] = [
      {
        item: essential("water-1", 4),
        entry: entry("water-1", { quantity: 2 }),
      },
      { item: essential("water-2"), entry: entry("water-2") },
    ];
    // (2·0.5 + 2·1) / 4 = 75
    expect(readinessPercent(lines)).toBe(75);
  });

  it("gives no credit for bought items", () => {
    expect(
      readinessPercent([
        {
          item: essential("water-1"),
          entry: entry("water-1", { status: "bought" }),
        },
      ]),
    ).toBe(0);
  });

  it("reaches 100 only when every item is fully packed", () => {
    const lines: ToteLine[] = [
      { item: essential("water-1"), entry: entry("water-1") },
      { item: optional("food-1"), entry: entry("food-1") },
      { item: optional("food-2"), entry: entry("food-2") },
    ];
    expect(readinessPercent(lines)).toBe(100);

    lines.push({
      item: optional("food-3", 200),
      entry: entry("food-3", { quantity: 199 }),
    });
    expect(readinessPercent(lines)).toBe(99);
  });
});

describe("statusCounts", () => {
  it("counts items without an entry as needed", () => {
    expect(
      statusCounts([
        { item: essential("water-1"), entry: entry("water-1") },
        {
          item: essential("water-2"),
          entry: entry("water-2", { status: "bought" }),
        },
        { item: optional("food-1") },
      ]),
    ).toEqual({ needed: 1, bought: 1, packed: 1, total: 3 });
  });
});

describe("addMonths", () => {
  it("adds calendar months in UTC", () => {
    expect(addMonths(new Date("2026-01-15T23:30:00Z"), 12)).toBe("2027-01-15");
    expect(addMonths(new Date("2026-11-30T00:00:00Z"), 3)).toBe("2027-02-28");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1)).toBe("2026-02-28");
    expect(addMonths(new Date("2028-01-31T00:00:00Z"), 1)).toBe("2028-02-29");
  });
});

describe("expiryOf", () => {
  const water = item("water-1", { shelfLifeMonths: 6 });

  it("prefers the label date", () => {
    expect(
      expiryOf({
        item: water,
        entry: entry("water-1", { expiresOn: "2026-03-01" }),
      }),
    ).toEqual({ expiresOn: "2026-03-01", estimated: false });
  });

  it("estimates from packedAt plus shelf life", () => {
    expect(expiryOf({ item: water, entry: entry("water-1") })).toEqual({
      expiresOn: "2026-07-15",
      estimated: true,
    });
  });

  it("is null for needed items, items that do not expire, or unknown dates", () => {
    expect(expiryOf({ item: water })).toBeNull();
    expect(
      expiryOf({
        item: water,
        entry: entry("water-1", { status: "needed", expiresOn: "2026-02-01" }),
      }),
    ).toBeNull();
    expect(
      expiryOf({
        item: item("water-1", { shelfLifeMonths: null }),
        entry: entry("water-1"),
      }),
    ).toBeNull();
    expect(
      expiryOf({
        item: water,
        entry: entry("water-1", { status: "bought", packedAt: null }),
      }),
    ).toBeNull();
  });
});

describe("expiringSoon", () => {
  const today = new Date("2026-06-01T18:00:00Z");

  it("lists items within 60 days and already expired ones, soonest first", () => {
    const lines: ToteLine[] = [
      {
        item: item("water-1"),
        entry: entry("water-1", { expiresOn: "2026-07-31" }), // 60 days
      },
      {
        item: item("water-2"),
        entry: entry("water-2", { expiresOn: "2026-08-01" }), // 61 days
      },
      {
        item: item("food-1"),
        entry: entry("food-1", { expiresOn: "2026-05-30" }), // expired
      },
      {
        item: item("food-2", { shelfLifeMonths: 6 }),
        // Packed 2026-01-15 + 6 months = 2026-07-15, 44 days out.
        entry: entry("food-2"),
      },
    ];

    expect(
      expiringSoon(lines, today).map((e) => [
        e.item.id,
        e.expiresOn,
        e.daysLeft,
        e.estimated,
      ]),
    ).toEqual([
      ["food-1", "2026-05-30", -2, false],
      ["food-2", "2026-07-15", 44, true],
      ["water-1", "2026-07-31", 60, false],
    ]);
  });
});

describe("hazardCoverage", () => {
  const hazards: HazardEntry[] = [
    { hazard: "heat", relevance: "primary", sources: ["ready-heat"] },
    { hazard: "flood", relevance: "secondary", sources: ["ready-floods"] },
  ];
  const heatItem = item("water-6", {
    relevance: "primary",
    hazards: ["heat"],
    units: 3,
  });

  it("covers a hazard once all of its items are fully packed", () => {
    const partial: ToteLine[] = [
      { item: essential("water-1"), entry: entry("water-1") },
      { item: heatItem, entry: entry("water-6", { quantity: 2 }) },
    ];
    expect(hazardCoverage(hazards, partial)).toEqual([
      {
        hazard: "heat",
        relevance: "primary",
        via: "items",
        covered: false,
        missing: ["water-6"],
      },
      {
        hazard: "flood",
        relevance: "secondary",
        via: "essentials",
        covered: true,
        missing: [],
      },
    ]);

    const full: ToteLine[] = [
      partial[0],
      { item: heatItem, entry: entry("water-6") },
    ];
    expect(hazardCoverage(hazards, full)[0]).toMatchObject({
      covered: true,
      missing: [],
    });
  });

  it("falls back to the base essentials for a hazard with no items", () => {
    const lines: ToteLine[] = [
      { item: essential("water-1") },
      { item: optional("food-1"), entry: entry("food-1") },
    ];
    expect(hazardCoverage(hazards, lines)[1]).toMatchObject({
      hazard: "flood",
      via: "essentials",
      covered: false,
    });
  });
});

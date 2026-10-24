import { getRegion } from "../../data/fema-regions";
import { HDX_27_GAL_TOTE } from "../../tote/container";
import { packTote } from "../../tote/pack-tote";
import {
  HOUSEHOLD_FIXTURES,
  REGION_FIXTURES,
  type HouseholdFixtureName,
} from "../fixtures";
import { CATALOG_ITEMS } from "../items";
import {
  RELEVANCE_WEIGHT,
  resolveKit,
  toPackItems,
  type ResolvedItem,
} from "../resolve-kit";
import type { CatalogItem } from "../types";

const single = HOUSEHOLD_FIXTURES["single-adult"];
const family = HOUSEHOLD_FIXTURES["family-infant-dog"];
const seniors = HOUSEHOLD_FIXTURES["seniors-cat-14-days"];

const ids = (items: readonly ResolvedItem[]) => items.map((i) => i.id);
const find = (items: readonly ResolvedItem[], id: string) =>
  items.find((i) => i.id === id);

/** One reviewable line per item: id, units, relevance, flags, hazards, note. */
function summarize(items: readonly ResolvedItem[]): string[] {
  return items.map((item) =>
    [
      item.id,
      `x${item.units}`,
      item.relevance,
      item.essential ? "essential" : "optional",
      item.packable ? "" : "beside-tote",
      item.hazards.length ? `[${item.hazards.join(", ")}]` : "",
      item.regionNote ? "+note" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

describe("resolveKit snapshots", () => {
  const households = Object.keys(HOUSEHOLD_FIXTURES) as HouseholdFixtureName[];

  describe.each(REGION_FIXTURES)("region $region ($place)", (fixture) => {
    test.each(households)("%s", (name) => {
      const kit = resolveKit(fixture.region, HOUSEHOLD_FIXTURES[name], {
        state: fixture.state,
      });
      expect(summarize(kit)).toMatchSnapshot();
    });
  });
});

describe("resolveKit", () => {
  test("every region gets every base item that scales above 0", () => {
    const base = CATALOG_ITEMS.filter((i) => i.appliesTo === "base").map(
      (i) => i.id,
    );
    for (const { region } of REGION_FIXTURES) {
      const kit = ids(resolveKit(region, family));
      for (const id of base) {
        if (id === "medical-2" || id === "medical-12") continue; // conditional
        if (id === "food-11" || id === "shelter-11") continue; // cats only
        expect(kit).toContain(id);
      }
    }
  });

  test("adds hazard items only where the region faces the hazard", () => {
    // N95: wildfire or volcano, only in regions 8, 9 and 10.
    const withN95 = REGION_FIXTURES.filter(({ region }) =>
      ids(resolveKit(region, single)).includes("shelter-3"),
    ).map((f) => f.region);
    expect(withN95).toEqual([8, 9, 10]);

    // ready-kit items are in every region's kit.
    for (const { region } of REGION_FIXTURES) {
      const kit = ids(resolveKit(region, single));
      for (const id of ["tools-8", "shelter-9", "shelter-10"]) {
        expect(kit).toContain(id);
      }
    }
  });

  test("takes the strongest relevance among matched hazards", () => {
    // Region 4: hurricane and tornado are both primary.
    const r4 = find(resolveKit(4, single), "medical-16");
    expect(r4?.relevance).toBe("primary");
    expect(r4?.hazards).toEqual(["hurricane", "tornado"]);

    // Region 3: only hurricane, as secondary.
    const r3 = find(resolveKit(3, single), "medical-16");
    expect(r3?.relevance).toBe("secondary");
    expect(r3?.hazards).toEqual(["hurricane"]);

    // Base items are always "base" with no hazards.
    const water = find(resolveKit(3, single), "water-1");
    expect(water?.relevance).toBe("base");
    expect(water?.hazards).toEqual([]);
  });

  test("keeps the item's own essential flag", () => {
    const kit = resolveKit(9, single);
    expect(find(kit, "shelter-3")?.essential).toBe(true);
    expect(find(kit, "water-3")?.essential).toBe(false);
  });

  test("scales quantities to the household", () => {
    // 1 gal × 5 people × 3 days.
    expect(find(resolveKit(1, family), "water-1")?.units).toBe(15);
    // 1 gal × 2 people × 14 days.
    expect(find(resolveKit(1, seniors), "water-1")?.units).toBe(28);
    // 8 diapers × 1 infant × 3 days = 24 → 1 pack of 30.
    expect(find(resolveKit(1, family), "medical-13")?.units).toBe(1);
  });

  test("leaves infants out of items they can't use", () => {
    const kit = resolveKit(9, family);
    // 5 people, 1 an infant: meals and whistles for 4; water for all 5.
    expect(find(kit, "food-1")?.units).toBe(12);
    expect(find(kit, "comms-2")?.units).toBe(4);
    expect(find(kit, "water-1")?.units).toBe(15);
  });

  test("leaves out items that scale to 0", () => {
    const kit = ids(resolveKit(1, single));
    for (const id of ["medical-2", "medical-12", "medical-13", "water-7"]) {
      expect(kit).not.toContain(id);
    }
    const seniorKit = ids(resolveKit(1, seniors));
    expect(seniorKit).toContain("medical-2");
    expect(seniorKit).toContain("medical-12");
    expect(seniorKit).toContain("food-11");
    expect(seniorKit).not.toContain("food-10");
  });

  test("returns items in category order", () => {
    const kit = ids(resolveKit(9, family));
    // Added items sit with their category, not at the end.
    expect(kit.indexOf("water-7")).toBeLessThan(kit.indexOf("food-1"));
    expect(kit.indexOf("food-10")).toBeLessThan(kit.indexOf("medical-1"));
    expect(kit.indexOf("tools-9")).toBeLessThan(kit.indexOf("comms-1"));
  });

  test("applies region notes, and state notes when a state is given", () => {
    expect(find(resolveKit(9, single), "water-1")?.regionNote).toBeNull();
    expect(
      find(resolveKit(9, single, { state: "AZ" }), "water-1")?.regionNote,
    ).toMatch(/Desert climate/);
    expect(
      find(resolveKit(9, single, { state: "CA" }), "water-1")?.regionNote,
    ).toBeNull();
  });

  test("accepts a region object", () => {
    expect(resolveKit(getRegion(10), family)).toEqual(resolveKit(10, family));
  });

  test("accepts a custom catalog", () => {
    const item: CatalogItem = {
      ...CATALOG_ITEMS[0],
      id: "water-99",
      appliesTo: ["tsunami"],
    };
    expect(ids(resolveKit(1, single, { catalog: [item] }))).toEqual([]);
    expect(ids(resolveKit(2, single, { catalog: [item] }))).toEqual([
      "water-99",
    ]);
  });

  test("does not mutate the catalog", () => {
    const before = JSON.stringify(CATALOG_ITEMS);
    resolveKit(9, family, { state: "AZ" });
    expect(JSON.stringify(CATALOG_ITEMS)).toBe(before);
  });
});

describe("toPackItems", () => {
  test("maps resolved items to packTote input", () => {
    const kit = resolveKit(4, family);
    const packItems = toPackItems(kit);
    expect(packItems).toHaveLength(kit.length);
    const water = packItems.find((p) => p.id === "water-1");
    expect(water).toEqual({
      id: "water-1",
      quantity: 15,
      unitVolumeL: 4,
      unitWeightKg: 3.9,
      packable: false,
      essential: true,
      hazardRelevance: RELEVANCE_WEIGHT.base,
    });
    const secondary = toPackItems(resolveKit(3, single)).find(
      (p) => p.id === "medical-16",
    );
    expect(secondary?.hazardRelevance).toBe(RELEVANCE_WEIGHT.secondary);
  });

  test.each(REGION_FIXTURES)(
    "every unit of region $region's kits lands in fits or overflow",
    ({ region }) => {
      for (const household of Object.values(HOUSEHOLD_FIXTURES)) {
        const kit = resolveKit(region, household);
        const result = packTote(toPackItems(kit), HDX_27_GAL_TOTE);
        const placed = new Map<string, number>();
        for (const line of [...result.fits, ...result.overflow]) {
          placed.set(line.id, (placed.get(line.id) ?? 0) + line.quantity);
        }
        for (const item of kit) {
          expect(placed.get(item.id)).toBe(item.units);
        }
      }
    },
  );
});

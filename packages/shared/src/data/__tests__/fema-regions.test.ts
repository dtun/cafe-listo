import {
  FEMA_REGIONS,
  STATE_CODES,
  US_STATES,
  getRegion,
  regionForState,
} from "../fema-regions";
import { SOURCES } from "../sources";

const sourceIds = new Set<string>(SOURCES.map((s) => s.id));

describe("FEMA_REGIONS", () => {
  test("has regions 1 through 10 in order", () => {
    expect(FEMA_REGIONS.map((r) => r.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  test("covers all 50 states, DC and the territories", () => {
    expect(US_STATES).toHaveLength(50);
    const covered = FEMA_REGIONS.flatMap((r) => r.states).sort();
    expect(covered).toEqual([...STATE_CODES].sort());
  });

  test("every state maps to exactly one region", () => {
    for (const code of STATE_CODES) {
      const regions = FEMA_REGIONS.filter((r) => r.states.includes(code));
      expect(regions).toHaveLength(1);
    }
  });

  test("contact URLs are the region pages", () => {
    for (const region of FEMA_REGIONS) {
      expect(region.contactUrl).toBe(
        `https://www.fema.gov/about/regions/region-${region.id}`,
      );
      expect(region.source).toBe(`fema-region-${region.id}`);
    }
  });

  test("every hazard entry has at least one valid source id", () => {
    for (const region of FEMA_REGIONS) {
      expect(region.hazards.length).toBeGreaterThan(0);
      for (const entry of region.hazards) {
        expect(entry.sources.length).toBeGreaterThan(0);
        for (const id of entry.sources) {
          expect(sourceIds.has(id)).toBe(true);
        }
      }
    }
  });

  test("no hazard is listed twice in a region", () => {
    for (const region of FEMA_REGIONS) {
      const hazards = region.hazards.map((h) => h.hazard);
      expect(new Set(hazards).size).toBe(hazards.length);
    }
  });

  test("every region has at least one primary hazard", () => {
    for (const region of FEMA_REGIONS) {
      expect(region.hazards.some((h) => h.relevance === "primary")).toBe(true);
    }
  });
});

describe("regionForState", () => {
  test.each([
    ["AZ", 9],
    ["FL", 4],
    ["NY", 2],
    ["AK", 10],
    ["PR", 2],
    ["GU", 9],
    ["DC", 3],
    ["VI", 2],
    ["TX", 6],
    ["MH", 9],
  ])("%s is in Region %i", (code, id) => {
    expect(regionForState(code)?.id).toBe(id);
  });

  test("is case-insensitive", () => {
    expect(regionForState("az")?.id).toBe(9);
  });

  test("returns undefined for unknown codes", () => {
    expect(regionForState("XX")).toBeUndefined();
    expect(regionForState("")).toBeUndefined();
  });
});

describe("getRegion", () => {
  test("returns the region by id", () => {
    expect(getRegion(9).office).toBe("Oakland, CA");
  });
});

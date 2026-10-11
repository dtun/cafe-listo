import {
  householdSchema,
  MAX_HOUSEHOLD_COUNT,
  quantityRuleSchema,
} from "../household/schema";
import { scale } from "../household/scale";
import { DEFAULT_HOUSEHOLD_DAYS, MAX_HOUSEHOLD_DAYS } from "../household/types";

describe("householdSchema", () => {
  it("fills defaults for a single adult", () => {
    expect(householdSchema.parse({ adults: 1 })).toEqual({
      adults: 1,
      seniors: 0,
      children: { count: 0 },
      infants: 0,
      pets: { dogs: 0, cats: 0, other: 0 },
      medical: { needs: [], flags: [] },
      dietary: [],
      days: DEFAULT_HOUSEHOLD_DAYS,
    });
  });

  it("defaults the duration to 3 days", () => {
    expect(DEFAULT_HOUSEHOLD_DAYS).toBe(3);
    expect(householdSchema.parse({ adults: 2 }).days).toBe(3);
  });

  it("fills nested defaults for partial objects", () => {
    const h = householdSchema.parse({
      adults: 1,
      pets: { dogs: 1 },
      medical: { flags: ["mobility"] },
    });
    expect(h.pets).toEqual({ dogs: 1, cats: 0, other: 0 });
    expect(h.medical).toEqual({ needs: [], flags: ["mobility"] });
  });

  it("parses a family of 5 with an infant and a dog", () => {
    const h = householdSchema.parse({
      adults: 2,
      children: { count: 2, bands: { toddler: 1, child: 1 } },
      infants: 1,
      pets: { dogs: 1 },
      medical: { needs: [" EpiPen "], flags: ["prescription_meds"] },
      dietary: ["nut_allergy"],
      days: 7,
    });
    expect(h.medical.needs).toEqual(["EpiPen"]);
    expect(scale({ kind: "per_person_per_day", amount: 1 }, h)).toBe(35);
  });

  it("accepts the 14-day maximum and rejects more", () => {
    expect(MAX_HOUSEHOLD_DAYS).toBe(14);
    expect(householdSchema.parse({ adults: 1, days: 14 }).days).toBe(14);
    expect(householdSchema.safeParse({ adults: 1, days: 15 }).success).toBe(
      false,
    );
  });

  it.each([0, -1, 2.5])("rejects %p days", (days) => {
    expect(householdSchema.safeParse({ adults: 1, days }).success).toBe(false);
  });

  it("rejects negative, fractional and oversized counts", () => {
    for (const adults of [-1, 1.5, MAX_HOUSEHOLD_COUNT + 1]) {
      expect(householdSchema.safeParse({ adults }).success).toBe(false);
    }
    expect(
      householdSchema.safeParse({ adults: 1, pets: { cats: -1 } }).success,
    ).toBe(false);
  });

  it("requires at least one person", () => {
    expect(householdSchema.safeParse({}).success).toBe(false);
    expect(householdSchema.safeParse({ pets: { dogs: 2 } }).success).toBe(
      false,
    );
    expect(householdSchema.safeParse({ seniors: 1 }).success).toBe(true);
  });

  it("rejects age bands that exceed the child count", () => {
    const result = householdSchema.safeParse({
      adults: 1,
      children: { count: 1, bands: { child: 1, teen: 1 } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown flags", () => {
    expect(
      householdSchema.safeParse({ adults: 1, dietary: ["carnivore"] }).success,
    ).toBe(false);
    expect(
      householdSchema.safeParse({
        adults: 1,
        medical: { flags: ["gluten_free"] },
      }).success,
    ).toBe(false);
  });
});

describe("quantityRuleSchema", () => {
  it.each([
    { kind: "per_person_per_day", amount: 1 },
    { kind: "per_person", amount: 1, packSize: 2 },
    { kind: "per_household", amount: 1 },
    { kind: "per_pet_per_day", amount: 0.5, pets: ["dogs"] },
    { kind: "per_infant", amount: 6 },
    {
      kind: "conditional",
      flag: "power_dependent",
      rule: { kind: "per_household", amount: 1 },
    },
  ])("accepts $kind", (rule) => {
    expect(quantityRuleSchema.parse(rule)).toEqual(rule);
  });

  it.each([
    { kind: "per_week", amount: 1 },
    { kind: "per_person", amount: 0 },
    { kind: "per_person", amount: 1, packSize: -1 },
    { kind: "per_pet_per_day", amount: 1, pets: [] },
    {
      kind: "conditional",
      flag: "not_a_flag",
      rule: { kind: "per_household", amount: 1 },
    },
    {
      kind: "conditional",
      flag: "mobility",
      rule: {
        kind: "conditional",
        flag: "vegan",
        rule: { kind: "per_household", amount: 1 },
      },
    },
  ])("rejects %j", (rule) => {
    expect(quantityRuleSchema.safeParse(rule).success).toBe(false);
  });
});

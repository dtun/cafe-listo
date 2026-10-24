import { hasHouseholdFlag, householdSize, scale } from "../household/scale";
import type { Household, QuantityRule } from "../household/types";

function household(overrides: Partial<Household> = {}): Household {
  return {
    adults: 1,
    seniors: 0,
    children: { count: 0 },
    infants: 0,
    pets: { dogs: 0, cats: 0, other: 0 },
    medical: { needs: [], flags: [] },
    dietary: [],
    days: 3,
    ...overrides,
  };
}

const singleAdult = household();

/** 2 adults, 2 children, 1 infant and a dog. */
const familyOfFive = household({
  adults: 2,
  children: { count: 2, bands: { child: 2 } },
  infants: 1,
  pets: { dogs: 1, cats: 0, other: 0 },
});

const water: QuantityRule = { kind: "per_person_per_day", amount: 1 };

describe("householdSize", () => {
  it("counts adults, seniors, children and infants but not pets", () => {
    expect(householdSize(singleAdult)).toBe(1);
    expect(householdSize(familyOfFive)).toBe(5);
    expect(householdSize(household({ adults: 0, seniors: 2 }))).toBe(2);
  });
});

describe("hasHouseholdFlag", () => {
  it("finds medical and dietary flags", () => {
    const h = household({
      medical: { needs: ["insulin"], flags: ["prescription_meds"] },
      dietary: ["gluten_free"],
    });
    expect(hasHouseholdFlag(h, "prescription_meds")).toBe(true);
    expect(hasHouseholdFlag(h, "gluten_free")).toBe(true);
    expect(hasHouseholdFlag(h, "mobility")).toBe(false);
  });
});

describe("scale", () => {
  describe("per_person_per_day", () => {
    it("multiplies by people and days", () => {
      expect(scale(water, singleAdult)).toBe(3);
      expect(scale(water, familyOfFive)).toBe(15);
    });

    it("scales to the 14-day maximum", () => {
      expect(scale(water, household({ days: 14 }))).toBe(14);
      expect(scale(water, { ...familyOfFive, days: 14 })).toBe(70);
    });

    it("leaves infants out of the daily count when excludeInfants is set", () => {
      const meals: QuantityRule = { ...water, excludeInfants: true };
      expect(scale(meals, familyOfFive)).toBe(12); // 4 people × 3 days
    });
  });

  describe("per_person", () => {
    it("multiplies by people regardless of days", () => {
      const rule: QuantityRule = { kind: "per_person", amount: 1 };
      expect(scale(rule, singleAdult)).toBe(1);
      expect(scale(rule, { ...familyOfFive, days: 14 })).toBe(5);
    });

    it("leaves infants out when excludeInfants is set", () => {
      const rule: QuantityRule = {
        kind: "per_person",
        amount: 1,
        excludeInfants: true,
      };
      expect(scale(rule, familyOfFive)).toBe(4);
      expect(scale(rule, household({ adults: 0, infants: 1 }))).toBe(0);
    });
  });

  describe("per_household", () => {
    it("is constant for any household", () => {
      const rule: QuantityRule = { kind: "per_household", amount: 1 };
      expect(scale(rule, singleAdult)).toBe(1);
      expect(scale(rule, { ...familyOfFive, days: 14 })).toBe(1);
    });
  });

  describe("per_pet_per_day", () => {
    const petWater: QuantityRule = {
      kind: "per_pet_per_day",
      amount: 0.5,
    };

    it("is 0 without pets", () => {
      expect(scale(petWater, singleAdult)).toBe(0);
    });

    it("multiplies by all pets and days by default", () => {
      expect(scale(petWater, familyOfFive)).toBe(2); // 1 × 0.5 × 3 = 1.5
      const zoo = household({ pets: { dogs: 2, cats: 1, other: 1 } });
      expect(scale(petWater, zoo)).toBe(6); // 4 × 0.5 × 3
    });

    it("counts only the listed pet kinds", () => {
      const dogFood: QuantityRule = {
        kind: "per_pet_per_day",
        amount: 1,
        pets: ["dogs"],
      };
      const h = household({ pets: { dogs: 1, cats: 3, other: 0 } });
      expect(scale(dogFood, h)).toBe(3);
      expect(scale(dogFood, familyOfFive)).toBe(3);
    });
  });

  describe("per_infant", () => {
    const formula: QuantityRule = { kind: "per_infant", amount: 2 };

    it("is 0 without infants", () => {
      expect(scale(formula, singleAdult)).toBe(0);
    });

    it("multiplies by infants", () => {
      expect(scale(formula, familyOfFive)).toBe(2);
      expect(scale(formula, household({ infants: 2 }))).toBe(4);
    });
  });

  describe("per_infant_per_day", () => {
    const diapers: QuantityRule = {
      kind: "per_infant_per_day",
      amount: 8,
      packSize: 30,
    };

    it("is 0 without infants", () => {
      expect(scale(diapers, singleAdult)).toBe(0);
    });

    it("multiplies by infants and days, then rounds up to packs", () => {
      // 1 infant × 8 × 3 days = 24 → 1 pack of 30
      expect(scale(diapers, familyOfFive)).toBe(1);
      // 2 infants × 8 × 14 days = 224 → 8 packs of 30
      expect(scale(diapers, household({ infants: 2, days: 14 }))).toBe(8);
    });
  });

  describe("conditional", () => {
    const meds: QuantityRule = {
      kind: "conditional",
      flag: "prescription_meds",
      rule: { kind: "per_person_per_day", amount: 1, packSize: 7 },
    };

    it("is 0 when the flag is not set", () => {
      expect(scale(meds, familyOfFive)).toBe(0);
    });

    it("applies the inner rule when a medical flag is set", () => {
      const h = household({
        days: 14,
        medical: { needs: [], flags: ["prescription_meds"] },
      });
      expect(scale(meds, h)).toBe(2);
    });

    it("applies the inner rule when a dietary flag is set", () => {
      const glutenFree: QuantityRule = {
        kind: "conditional",
        flag: "gluten_free",
        rule: { kind: "per_household", amount: 1 },
      };
      expect(scale(glutenFree, singleAdult)).toBe(0);
      expect(scale(glutenFree, household({ dietary: ["gluten_free"] }))).toBe(
        1,
      );
    });
  });

  describe("rounding to purchasable units", () => {
    it("rounds up to whole units", () => {
      const rule: QuantityRule = { kind: "per_person_per_day", amount: 0.5 };
      expect(scale(rule, singleAdult)).toBe(2); // 1.5
    });

    it("rounds up to whole packs", () => {
      // 1 gallon/person/day, sold in 5-gallon jugs.
      const rule: QuantityRule = {
        kind: "per_person_per_day",
        amount: 1,
        packSize: 5,
      };
      expect(scale(rule, singleAdult)).toBe(1); // 3 gal
      expect(scale(rule, familyOfFive)).toBe(3); // 15 gal
      expect(scale(rule, { ...familyOfFive, days: 14 })).toBe(14); // 70 gal
    });

    it("does not round up float noise", () => {
      const rule: QuantityRule = { kind: "per_person_per_day", amount: 0.1 };
      // 0.1 × 3 = 0.30000000000000004; × 10 people would be 3.0000000000000004
      expect(scale(rule, household({ adults: 10, days: 1 }))).toBe(1);
      expect(scale(rule, household({ adults: 10, days: 3 }))).toBe(3);
    });

    it("returns 0, not 1, when nothing is needed", () => {
      const rule: QuantityRule = { kind: "per_infant", amount: 1, packSize: 4 };
      expect(scale(rule, singleAdult)).toBe(0);
    });
  });

  describe("family of 5 with an infant and a dog, 3 days", () => {
    it("scales a mixed set of rules", () => {
      const rules: Record<string, QuantityRule> = {
        water: { kind: "per_person_per_day", amount: 1 },
        flashlight: { kind: "per_person", amount: 1 },
        radio: { kind: "per_household", amount: 1 },
        dogFood: { kind: "per_pet_per_day", amount: 1, pets: ["dogs"] },
        catFood: { kind: "per_pet_per_day", amount: 1, pets: ["cats"] },
        diapers: { kind: "per_infant", amount: 1 },
        batteryPack: {
          kind: "conditional",
          flag: "power_dependent",
          rule: { kind: "per_household", amount: 1 },
        },
      };
      const quantities = Object.fromEntries(
        Object.entries(rules).map(([id, rule]) => [
          id,
          scale(rule, familyOfFive),
        ]),
      );
      expect(quantities).toEqual({
        water: 15,
        flashlight: 5,
        radio: 1,
        dogFood: 3,
        catFood: 0,
        diapers: 1,
        batteryPack: 0,
      });
    });
  });
});

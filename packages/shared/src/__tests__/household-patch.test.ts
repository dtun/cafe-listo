import { applyHouseholdPatch, isEmptyHouseholdPatch } from "../household/patch";
import {
  householdPatchSchema,
  householdSchema,
  validateHousehold,
} from "../household/schema";
import type { Household } from "../household/types";

const stored: Household = householdSchema.parse({
  adults: 2,
  children: { count: 1, bands: { child: 1 } },
  pets: { dogs: 1 },
  medical: { needs: ["insulin (refrigerated)"], flags: ["prescription_meds"] },
  dietary: ["vegetarian"],
  days: 7,
});

describe("applyHouseholdPatch", () => {
  it("keeps omitted fields and replaces sent ones", () => {
    const merged = applyHouseholdPatch(stored, { adults: 3, dietary: [] });

    expect(merged).toEqual({ ...stored, adults: 3, dietary: [] });
  });

  it("merges pets and medical per key", () => {
    const merged = applyHouseholdPatch(stored, {
      pets: { cats: 2 },
      medical: { flags: ["mobility"] },
    });

    expect(merged.pets).toEqual({ dogs: 1, cats: 2, other: 0 });
    expect(merged.medical).toEqual({
      needs: ["insulin (refrigerated)"],
      flags: ["mobility"],
    });
  });

  it("replaces children whole, so bands never outlive their count", () => {
    const merged = applyHouseholdPatch(stored, { children: { count: 0 } });

    expect(merged.children).toEqual({ count: 0 });
  });

  it("ignores explicit undefined values", () => {
    const merged = applyHouseholdPatch(stored, {
      adults: undefined,
      pets: { dogs: undefined },
    });

    expect(merged).toEqual(stored);
  });

  it("starts from nothing on a first save", () => {
    expect(applyHouseholdPatch(null, { adults: 1, pets: { dogs: 1 } })).toEqual(
      { adults: 1, pets: { dogs: 1 } },
    );
  });

  it("does not mutate the stored household", () => {
    const before = structuredClone(stored);
    applyHouseholdPatch(stored, { pets: { cats: 4 }, medical: { needs: [] } });

    expect(stored).toEqual(before);
  });
});

describe("isEmptyHouseholdPatch", () => {
  it("is true only when no field is set", () => {
    expect(isEmptyHouseholdPatch({})).toBe(true);
    expect(isEmptyHouseholdPatch({ adults: undefined })).toBe(true);
    expect(isEmptyHouseholdPatch({ adults: 0 })).toBe(false);
  });
});

describe("householdPatchSchema", () => {
  it("accepts an empty patch without filling defaults", () => {
    expect(householdPatchSchema.parse({})).toEqual({});
    expect(householdPatchSchema.parse({ pets: { cats: 1 } })).toEqual({
      pets: { cats: 1 },
    });
  });

  it("rejects bad counts, flags and durations", () => {
    expect(householdPatchSchema.safeParse({ adults: -1 }).success).toBe(false);
    expect(householdPatchSchema.safeParse({ days: 15 }).success).toBe(false);
    expect(householdPatchSchema.safeParse({ dietary: ["keto"] }).success).toBe(
      false,
    );
    expect(
      householdPatchSchema.safeParse({ medical: { flags: ["asthma"] } })
        .success,
    ).toBe(false);
  });
});

describe("validateHousehold", () => {
  it("fills defaults on success", () => {
    const result = validateHousehold({ adults: 1 });

    expect(result.ok && result.household.days).toBe(3);
  });

  it("explains every issue", () => {
    expect(validateHousehold({})).toEqual({
      ok: false,
      message: "a household needs at least one person",
    });
    expect(
      validateHousehold({
        adults: 1,
        children: { count: 1, bands: { teen: 2 } },
      }),
    ).toEqual({
      ok: false,
      message:
        "children: children.bands must not add up to more than children.count",
    });
  });
});

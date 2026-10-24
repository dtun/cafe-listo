import { CONTAINERS, HDX_27_GAL_TOTE } from "../container";
import type { Container } from "../container";
import { packTote, STORE_BESIDE_TOTE_HINT } from "../pack-tote";
import type { PackItem } from "../pack-tote";

const tote = HDX_27_GAL_TOTE;

// A 1-gallon jug: ~3.8 L of water in a ~4.2 L footprint, ~3.9 kg full.
const gallonJug = { unitVolumeL: 4.2, unitWeightKg: 3.9 };

const singleAdult72Hour: PackItem[] = [
  {
    id: "water-gallon",
    quantity: 3,
    ...gallonJug,
    packable: true,
    essential: true,
    hazardRelevance: 1,
  },
  {
    id: "food-meal",
    quantity: 9,
    unitVolumeL: 0.5,
    unitWeightKg: 0.35,
    packable: true,
    essential: true,
    hazardRelevance: 0.9,
  },
  {
    id: "first-aid-kit",
    quantity: 1,
    unitVolumeL: 3,
    unitWeightKg: 1,
    packable: true,
    essential: true,
    hazardRelevance: 0.9,
  },
  {
    id: "flashlight",
    quantity: 1,
    unitVolumeL: 0.5,
    unitWeightKg: 0.3,
    packable: true,
    essential: true,
    hazardRelevance: 0.7,
  },
  {
    id: "crank-radio",
    quantity: 1,
    unitVolumeL: 1.5,
    unitWeightKg: 0.6,
    packable: true,
    essential: true,
    hazardRelevance: 0.7,
  },
  {
    id: "batteries",
    quantity: 1,
    unitVolumeL: 0.3,
    unitWeightKg: 0.3,
    packable: true,
    essential: true,
    hazardRelevance: 0.6,
  },
  {
    id: "emergency-blanket",
    quantity: 2,
    unitVolumeL: 0.2,
    unitWeightKg: 0.06,
    packable: true,
    hazardRelevance: 0.5,
  },
  {
    id: "documents",
    quantity: 1,
    unitVolumeL: 0.5,
    unitWeightKg: 0.3,
    packable: true,
    essential: true,
    hazardRelevance: 0.4,
  },
  {
    id: "multi-tool",
    quantity: 1,
    unitVolumeL: 0.2,
    unitWeightKg: 0.25,
    packable: true,
    hazardRelevance: 0.3,
  },
  {
    id: "deck-of-cards",
    quantity: 1,
    unitVolumeL: 0.1,
    unitWeightKg: 0.1,
    packable: true,
  },
];

// Five people, 14 days: 1 gal/person/day and 3 meals/person/day.
const familyOfFiveTwoWeek: PackItem[] = [
  {
    id: "water-gallon",
    quantity: 70,
    ...gallonJug,
    packable: true,
    essential: true,
    hazardRelevance: 1,
  },
  {
    id: "food-meal",
    quantity: 210,
    unitVolumeL: 0.5,
    unitWeightKg: 0.35,
    packable: true,
    essential: true,
    hazardRelevance: 0.9,
  },
  {
    id: "first-aid-kit",
    quantity: 1,
    unitVolumeL: 3,
    unitWeightKg: 1,
    packable: true,
    essential: true,
    hazardRelevance: 0.9,
  },
  {
    id: "pet-food-bag",
    quantity: 1,
    unitVolumeL: 20,
    unitWeightKg: 7,
    packable: false,
    hazardRelevance: 0.5,
  },
];

describe("HDX 27 Gal tote seed", () => {
  test("is about 102 L nominal and flagged provisional", () => {
    expect(tote.nominalVolumeL).toBe(102);
    expect(tote.usableVolumeL).toBeLessThanOrEqual(tote.nominalVolumeL);
    expect(tote.provisional).toBe(true);
    expect(CONTAINERS).toContain(tote);
  });
});

describe("packTote", () => {
  test("a single-adult 72-hour kit fits with nothing left over", () => {
    const result = packTote(singleAdult72Hour, tote);

    expect(result.overflow).toEqual([]);
    expect(result.fits).toHaveLength(singleAdult72Hour.length);
    expect(result.fillPercent).toBeGreaterThan(0);
    expect(result.fillPercent).toBeLessThanOrEqual(100);
    expect(result.weightKg).toBeLessThanOrEqual(tote.maxCarryWeightKg);
    expect(result.warnings.map((w) => w.code)).toEqual(["approximate"]);
  });

  test("always states that volume and weight are approximate", () => {
    for (const items of [[], singleAdult72Hour, familyOfFiveTwoWeek]) {
      const [first] = packTote(items, tote).warnings;
      expect(first.code).toBe("approximate");
      expect(first.message).toMatch(/volume and weight are approximate/i);
    }
  });

  test("a family-of-5 two-week kit overflows water with a clear warning", () => {
    const result = packTote(familyOfFiveTwoWeek, tote);

    const packedWater = result.fits.find((l) => l.id === "water-gallon");
    const spareWater = result.overflow.find((l) => l.id === "water-gallon");
    expect(packedWater?.quantity).toBe(20); // floor(87 L / 4.2 L)
    expect(spareWater).toMatchObject({
      quantity: 50,
      reason: "no-space",
      hint: STORE_BESIDE_TOTE_HINT,
    });

    const waterWarning = result.warnings.find(
      (w) => w.code === "overflow" && w.itemId === "water-gallon",
    );
    expect(waterWarning?.message).toMatch(/only 20 of 70 units/i);
    expect(waterWarning?.message).toMatch(/beside the tote/i);

    // 20 packed gallons alone weigh about 78 kg, far over the carry limit.
    expect(result.warnings.map((w) => w.code)).toContain("overweight");
  });

  test("puts packable: false items in overflow with a store-beside hint", () => {
    const result = packTote(familyOfFiveTwoWeek, tote);

    expect(result.fits.some((l) => l.id === "pet-food-bag")).toBe(false);
    expect(result.overflow).toContainEqual(
      expect.objectContaining({
        id: "pet-food-bag",
        quantity: 1,
        reason: "not-packable",
        hint: STORE_BESIDE_TOTE_HINT,
      }),
    );
  });

  test("packs essentials first, then by hazard relevance", () => {
    const small: Container = { ...tote, usableVolumeL: 10 };
    const items: PackItem[] = [
      {
        id: "nice-to-have",
        quantity: 1,
        unitVolumeL: 6,
        unitWeightKg: 1,
        packable: true,
        hazardRelevance: 1,
      },
      {
        id: "essential-low",
        quantity: 1,
        unitVolumeL: 6,
        unitWeightKg: 1,
        packable: true,
        essential: true,
        hazardRelevance: 0.1,
      },
      {
        id: "essential-high",
        quantity: 1,
        unitVolumeL: 4,
        unitWeightKg: 1,
        packable: true,
        essential: true,
        hazardRelevance: 0.9,
      },
    ];

    const result = packTote(items, small);

    expect(result.fits.map((l) => l.id)).toEqual([
      "essential-high",
      "essential-low",
    ]);
    expect(result.overflow.map((l) => l.id)).toEqual(["nice-to-have"]);
    expect(result.fillPercent).toBe(100);
  });

  test("lets a later small item fill space a bulky one could not", () => {
    const small: Container = { ...tote, usableVolumeL: 5 };
    const items: PackItem[] = [
      {
        id: "bulky",
        quantity: 1,
        unitVolumeL: 8,
        unitWeightKg: 1,
        packable: true,
        essential: true,
      },
      {
        id: "small",
        quantity: 2,
        unitVolumeL: 2,
        unitWeightKg: 1,
        packable: true,
      },
    ];

    const result = packTote(items, small);

    expect(result.fits).toEqual([
      { id: "small", quantity: 2, volumeL: 4, weightKg: 2 },
    ]);
    expect(result.overflow[0]).toMatchObject({
      id: "bulky",
      quantity: 1,
      reason: "no-space",
    });
  });

  describe("weight warning", () => {
    const brick = (quantity: number): PackItem[] => [
      {
        id: "brick",
        quantity,
        unitVolumeL: 1,
        unitWeightKg: 10,
        packable: true,
      },
    ];

    test("fires above the container's max carry weight", () => {
      const result = packTote(brick(3), tote);

      expect(result.weightKg).toBe(30);
      const warning = result.warnings.find((w) => w.code === "overweight");
      expect(warning?.message).toMatch(/30 kg/);
      expect(warning?.message).toMatch(/23 kg/);
    });

    test("stays quiet at or below the threshold", () => {
      const atLimit: Container = { ...tote, maxCarryWeightKg: 20 };

      expect(packTote(brick(2), atLimit).warnings.map((w) => w.code)).toEqual([
        "approximate",
      ]);
    });
  });

  describe("determinism", () => {
    test("returns the same result regardless of input order", () => {
      const forward = packTote(familyOfFiveTwoWeek, tote);
      const reversed = packTote([...familyOfFiveTwoWeek].reverse(), tote);

      expect(reversed).toEqual(forward);
      expect(packTote(familyOfFiveTwoWeek, tote)).toEqual(forward);
    });

    test("does not mutate its inputs", () => {
      const items = singleAdult72Hour.map((i) => Object.freeze({ ...i }));
      Object.freeze(items);
      const container = Object.freeze({ ...tote });

      expect(() => packTote(items, container)).not.toThrow();
    });
  });

  test("ignores zero-quantity items", () => {
    const result = packTote(
      [
        {
          id: "none",
          quantity: 0,
          unitVolumeL: 1,
          unitWeightKg: 1,
          packable: false,
        },
      ],
      tote,
    );

    expect(result.fits).toEqual([]);
    expect(result.overflow).toEqual([]);
    expect(result.fillPercent).toBe(0);
  });

  test.each([
    { quantity: 1.5 },
    { quantity: -1 },
    { unitVolumeL: -1 },
    { unitWeightKg: Number.NaN },
    { hazardRelevance: Number.POSITIVE_INFINITY },
  ])("rejects invalid input %o", (override) => {
    const item: PackItem = {
      id: "bad",
      quantity: 1,
      unitVolumeL: 1,
      unitWeightKg: 1,
      packable: true,
      ...override,
    };

    expect(() => packTote([item], tote)).toThrow(RangeError);
  });
});

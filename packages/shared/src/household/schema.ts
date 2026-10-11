import { z } from "zod";
import {
  DEFAULT_HOUSEHOLD_DAYS,
  DIETARY_FLAGS,
  MAX_HOUSEHOLD_DAYS,
  MEDICAL_FLAGS,
  PET_KINDS,
  type Household,
  type QuantityRule,
} from "./types";

/**
 * zod schemas for the household profile and quantity rules. Imported from
 * `@cafe-listo/shared/household`, never from the root index, so zod stays out
 * of mobile/landing bundles (see #38).
 */

/** Upper bound on any single count, to reject obviously bad input. */
export const MAX_HOUSEHOLD_COUNT = 50;

const count = z.number().int().min(0).max(MAX_HOUSEHOLD_COUNT);

export const medicalFlagSchema = z.enum(MEDICAL_FLAGS);
export const dietaryFlagSchema = z.enum(DIETARY_FLAGS);
export const householdFlagSchema = z.enum([...MEDICAL_FLAGS, ...DIETARY_FLAGS]);
export const petKindSchema = z.enum(PET_KINDS);

const childrenSchema = z
  .object({
    count: count.default(0),
    bands: z
      .object({
        toddler: count.optional(),
        child: count.optional(),
        teen: count.optional(),
      })
      .optional(),
  })
  .refine(
    ({ count, bands }) =>
      !bands ||
      (bands.toddler ?? 0) + (bands.child ?? 0) + (bands.teen ?? 0) <= count,
    { message: "children.bands must not add up to more than children.count" },
  );

/**
 * Validates a household profile and fills defaults: every count 0, no flags,
 * `days` 3. Requires at least one person. Parse output is a `Household`.
 */
export const householdSchema = z
  .object({
    adults: count.default(0),
    seniors: count.default(0),
    children: childrenSchema.default({ count: 0 }),
    infants: count.default(0),
    pets: z
      .object({
        dogs: count.default(0),
        cats: count.default(0),
        other: count.default(0),
      })
      .default({ dogs: 0, cats: 0, other: 0 }),
    medical: z
      .object({
        needs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
        flags: z.array(medicalFlagSchema).default([]),
      })
      .default({ needs: [], flags: [] }),
    dietary: z.array(dietaryFlagSchema).default([]),
    days: z
      .number()
      .int()
      .min(1)
      .max(MAX_HOUSEHOLD_DAYS)
      .default(DEFAULT_HOUSEHOLD_DAYS),
  })
  .refine((h) => h.adults + h.seniors + h.children.count + h.infants > 0, {
    message: "a household needs at least one person",
  }) satisfies z.ZodType<Household>;

/** Input accepted by `householdSchema` (fields with defaults are optional). */
export type HouseholdInput = z.input<typeof householdSchema>;

const ruleAmount = {
  amount: z.number().positive(),
  packSize: z.number().positive().optional(),
};

export const baseQuantityRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("per_person_per_day"), ...ruleAmount }),
  z.object({ kind: z.literal("per_person"), ...ruleAmount }),
  z.object({ kind: z.literal("per_household"), ...ruleAmount }),
  z.object({
    kind: z.literal("per_pet_per_day"),
    ...ruleAmount,
    pets: z.array(petKindSchema).min(1).optional(),
  }),
  z.object({ kind: z.literal("per_infant"), ...ruleAmount }),
]);

/** Validates a catalog item's quantity rule. */
export const quantityRuleSchema = z.discriminatedUnion("kind", [
  ...baseQuantityRuleSchema.options,
  z.object({
    kind: z.literal("conditional"),
    flag: householdFlagSchema,
    rule: baseQuantityRuleSchema,
  }),
]) satisfies z.ZodType<QuantityRule>;

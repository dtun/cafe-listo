/**
 * Household profile and quantity rules. Plain TS only — no runtime deps — so
 * the root entry point stays free of zod (see #38). The zod schema lives in
 * `./schema.ts`, exposed as `@cafe-listo/shared/household`.
 *
 * Keys are single words so the same shape works as MCP wire input
 * (snake_case) and as the domain type; enum values are snake_case.
 */

export const DEFAULT_HOUSEHOLD_DAYS = 3;
export const MAX_HOUSEHOLD_DAYS = 14;

export const CHILD_AGE_BANDS = ["toddler", "child", "teen"] as const;
/** toddler 1–3, child 4–12, teen 13–17. Infants (under 1) are counted separately. */
export type ChildAgeBand = (typeof CHILD_AGE_BANDS)[number];

export const PET_KINDS = ["dogs", "cats", "other"] as const;
export type PetKind = (typeof PET_KINDS)[number];

export const MEDICAL_FLAGS = [
  "prescription_meds",
  "mobility",
  "power_dependent",
] as const;
export type MedicalFlag = (typeof MEDICAL_FLAGS)[number];

export const DIETARY_FLAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_allergy",
  "low_sodium",
  "halal",
  "kosher",
] as const;
export type DietaryFlag = (typeof DIETARY_FLAGS)[number];

/** Any flag a conditional rule can depend on. */
export type HouseholdFlag = MedicalFlag | DietaryFlag;

export interface Household {
  /** Adults 18–64. */
  adults: number;
  /** Older adults, 65+. */
  seniors: number;
  /** Children 1–17; `bands` optionally breaks the count down by age. */
  children: {
    count: number;
    bands?: Partial<Record<ChildAgeBand, number>>;
  };
  /** Under 1 year. */
  infants: number;
  pets: Record<PetKind, number>;
  medical: {
    /** Free-form needs, e.g. "insulin (refrigerated)". */
    needs: string[];
    flags: MedicalFlag[];
  };
  dietary: DietaryFlag[];
  /** Shelter-in-place duration in days (default 3, max 14). */
  days: number;
}

/**
 * Fields shared by every non-conditional rule. `amount` is in the item's base
 * unit (e.g. gallons); `packSize` is how many base units one purchasable unit
 * holds (default 1). `scale` returns purchasable units, rounded up.
 */
interface RuleAmount {
  amount: number;
  packSize?: number;
}

export type PerPersonPerDayRule = RuleAmount & { kind: "per_person_per_day" };
export type PerPersonRule = RuleAmount & { kind: "per_person" };
export type PerHouseholdRule = RuleAmount & { kind: "per_household" };
export type PerPetPerDayRule = RuleAmount & {
  kind: "per_pet_per_day";
  /** Which pets count; all pets when omitted. */
  pets?: PetKind[];
};
export type PerInfantRule = RuleAmount & { kind: "per_infant" };

/** A rule that scales a quantity directly from the household. */
export type BaseQuantityRule =
  | PerPersonPerDayRule
  | PerPersonRule
  | PerHouseholdRule
  | PerPetPerDayRule
  | PerInfantRule;

/** Applies `rule` only when the household has `flag`; otherwise the quantity is 0. */
export interface ConditionalRule {
  kind: "conditional";
  flag: HouseholdFlag;
  rule: BaseQuantityRule;
}

/** How a catalog item's quantity scales with the household. Data, not code. */
export type QuantityRule = BaseQuantityRule | ConditionalRule;

export type QuantityRuleKind = QuantityRule["kind"];

import {
  PET_KINDS,
  type BaseQuantityRule,
  type Household,
  type HouseholdFlag,
  type PerPersonPerDayRule,
  type PerPersonRule,
  type PerPetPerDayRule,
  type PetKind,
  type QuantityRule,
} from "./types";

/** Everyone who eats and drinks: adults, seniors, children and infants. */
export function householdSize(household: Household): number {
  return (
    household.adults +
    household.seniors +
    household.children.count +
    household.infants
  );
}

export function hasHouseholdFlag(
  household: Household,
  flag: HouseholdFlag,
): boolean {
  return (
    (household.medical.flags as readonly string[]).includes(flag) ||
    (household.dietary as readonly string[]).includes(flag)
  );
}

function petCount(household: Household, rule: PerPetPerDayRule): number {
  const kinds: readonly PetKind[] = rule.pets ?? PET_KINDS;
  return kinds.reduce((sum, kind) => sum + household.pets[kind], 0);
}

function personCount(
  household: Household,
  rule: PerPersonPerDayRule | PerPersonRule,
): number {
  const size = householdSize(household);
  return rule.excludeInfants ? size - household.infants : size;
}

function baseNeed(rule: BaseQuantityRule, household: Household): number {
  switch (rule.kind) {
    case "per_person_per_day":
      return rule.amount * personCount(household, rule) * household.days;
    case "per_person":
      return rule.amount * personCount(household, rule);
    case "per_household":
      return rule.amount;
    case "per_pet_per_day":
      return rule.amount * petCount(household, rule) * household.days;
    case "per_infant":
      return rule.amount * household.infants;
    case "per_infant_per_day":
      return rule.amount * household.infants * household.days;
    default: {
      const unknown: never = rule;
      throw new Error(`Unknown quantity rule: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Tolerance so float noise (e.g. 0.1 * 3) doesn't round up a whole unit. */
const EPSILON = 1e-9;

/**
 * Purchasable units of an item this household needs: the rule's need in base
 * units, divided by the pack size and rounded up. Pure; 0 means "not needed".
 */
export function scale(rule: QuantityRule, household: Household): number {
  if (rule.kind === "conditional") {
    return hasHouseholdFlag(household, rule.flag)
      ? scale(rule.rule, household)
      : 0;
  }
  const units = baseNeed(rule, household) / (rule.packSize ?? 1);
  return units <= EPSILON ? 0 : Math.ceil(units - EPSILON);
}

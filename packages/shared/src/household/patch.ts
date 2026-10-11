import type { DietaryFlag, Household, MedicalFlag, PetKind } from "./types";

/**
 * A partial update to a stored household. Omitted fields keep their stored
 * value. `pets` and `medical` merge per key; every other field replaces the
 * stored value. Plain TS (no zod), like `types.ts`.
 */
export interface HouseholdPatch {
  adults?: number;
  seniors?: number;
  children?: Household["children"];
  infants?: number;
  pets?: Partial<Record<PetKind, number>>;
  medical?: { needs?: string[]; flags?: MedicalFlag[] };
  dietary?: DietaryFlag[];
  days?: number;
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** True when the patch would change nothing. */
export function isEmptyHouseholdPatch(patch: HouseholdPatch): boolean {
  return Object.keys(defined(patch)).length === 0;
}

/**
 * Applies `patch` on top of `base` (or on nothing, for a first save). The
 * result is unvalidated input: run it through `householdSchema` (from
 * `@cafe-listo/shared/household`) to fill defaults and check invariants.
 */
export function applyHouseholdPatch(
  base: Household | null,
  patch: HouseholdPatch,
): HouseholdPatch {
  const { pets, medical, ...rest } = defined(patch);
  const merged: HouseholdPatch = { ...base, ...rest };
  if (pets) merged.pets = { ...base?.pets, ...defined(pets) };
  if (medical) merged.medical = { ...base?.medical, ...defined(medical) };
  return merged;
}

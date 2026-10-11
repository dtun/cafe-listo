/**
 * Test fixtures for `resolveKit`: one place per FEMA region and three
 * households. Not exported from the package index; other packages' tests
 * import them from `@cafe-listo/shared/fixtures`.
 */

import type { FemaRegionId, StateCode } from "../data/fema-regions";
import type { Household } from "../household/types";

export interface RegionFixture {
  region: FemaRegionId;
  state: StateCode;
  place: string;
}

/** A representative place in each region, at the regional office. */
export const REGION_FIXTURES: readonly RegionFixture[] = [
  { region: 1, state: "MA", place: "Cambridge, MA" },
  { region: 2, state: "NY", place: "New York, NY" },
  { region: 3, state: "PA", place: "Philadelphia, PA" },
  { region: 4, state: "GA", place: "Atlanta, GA" },
  { region: 5, state: "IL", place: "Chicago, IL" },
  { region: 6, state: "TX", place: "Denton, TX" },
  { region: 7, state: "MO", place: "Kansas City, MO" },
  { region: 8, state: "CO", place: "Denver, CO" },
  // Arizona rather than the Oakland office, so the Mesa notes are covered.
  { region: 9, state: "AZ", place: "Mesa, AZ" },
  { region: 10, state: "WA", place: "Bothell, WA" },
];

const EMPTY: Household = {
  adults: 0,
  seniors: 0,
  children: { count: 0 },
  infants: 0,
  pets: { dogs: 0, cats: 0, other: 0 },
  medical: { needs: [], flags: [] },
  dietary: [],
  days: 3,
};

export const HOUSEHOLD_FIXTURES = {
  /** One adult, no pets, the default 3 days. */
  "single-adult": { ...EMPTY, adults: 1 },
  /** Two adults, two children, an infant and a dog, 3 days. */
  "family-infant-dog": {
    ...EMPTY,
    adults: 2,
    children: { count: 2, bands: { child: 2 } },
    infants: 1,
    pets: { dogs: 1, cats: 0, other: 0 },
  },
  /** Two seniors with a cat, on prescriptions and powered equipment, 14 days. */
  "seniors-cat-14-days": {
    ...EMPTY,
    seniors: 2,
    pets: { dogs: 0, cats: 1, other: 0 },
    medical: {
      needs: ["oxygen concentrator"],
      flags: ["prescription_meds", "power_dependent"],
    },
    days: 14,
  },
} satisfies Record<string, Household>;

export type HouseholdFixtureName = keyof typeof HOUSEHOLD_FIXTURES;

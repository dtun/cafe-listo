import type { FemaRegionId, StateCode } from "../data/fema-regions";
import type { Household } from "../household/types";

/**
 * Where a user lives and who they prep for. Location is kept at state and
 * five-digit ZIP granularity only, never a street address or ZIP+4. The
 * region is derived from the state.
 */
export interface HouseholdProfile {
  region: FemaRegionId;
  state: StateCode;
  /** Five digits, or null when the user gave only a state. */
  zip: string | null;
  household: Household;
  updatedAt: Date;
}

/** Persistence port for household profiles: at most one per user. */
export interface ProfileRepository {
  /** The user's profile, or null if they have not saved one. */
  get(userId: string): Promise<HouseholdProfile | null>;
  /** Upsert: replaces the user's whole profile. */
  save(userId: string, profile: HouseholdProfile): Promise<void>;
}

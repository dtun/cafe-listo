import { getRegion, type HouseholdProfile } from "@cafe-listo/shared";

/** Wire shape for get_household and set_household. Household keys are already single words. */
export function profileDto(profile: HouseholdProfile | null) {
  if (!profile) return { profile: null };
  const region = getRegion(profile.region);
  return {
    profile: {
      state: profile.state,
      zip: profile.zip,
      region: { id: region.id, name: region.name },
      household: profile.household,
      updated_at: profile.updatedAt.toISOString(),
    },
  };
}

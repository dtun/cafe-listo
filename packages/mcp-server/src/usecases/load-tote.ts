import {
  getRegion,
  resolveKit,
  type ChecklistRepository,
  type FemaRegion,
  type HouseholdProfile,
  type ProfileRepository,
  type ToteLine,
} from "@cafe-listo/shared";
import { fail, ok, type UseCaseResult } from "./types";

/** The "no profile yet" error, naming the tool to call again afterwards. */
export function noProfileMessage(retryTool: string): string {
  return `No household profile saved yet, so there is no kit to track. Call set_household first with the user's state or ZIP and who is in the household (ask the user rather than guessing), then call ${retryTool} again.`;
}

export interface LoadedTote {
  profile: HouseholdProfile;
  region: FemaRegion;
  /** The resolved kit, in kit order, each with the user's entry if any. */
  lines: ToteLine[];
}

export interface LoadToteOptions {
  /** Plans for this many days instead of the profile's, without saving it. */
  days?: number;
}

/**
 * Loads the user's profile and checklist, resolves the kit for the profile
 * and joins each item with its entry. Entries for items outside the kit are
 * ignored. Fails with `not_found` when there is no profile, naming
 * `retryTool` so the assistant knows what to call after set_household.
 */
export async function loadTote(
  profiles: ProfileRepository,
  checklist: ChecklistRepository,
  userId: string,
  retryTool: string,
  options: LoadToteOptions = {},
): Promise<UseCaseResult<LoadedTote>> {
  const [profile, entries] = await Promise.all([
    profiles.get(userId),
    checklist.getEntries(userId),
  ]);
  if (!profile) return fail("not_found", noProfileMessage(retryTool));

  const region = getRegion(profile.region);
  const household =
    options.days === undefined
      ? profile.household
      : { ...profile.household, days: options.days };
  const kit = resolveKit(region, household, { state: profile.state });
  const byItem = new Map(entries.map((entry) => [entry.itemId, entry]));
  const lines: ToteLine[] = kit.map((item) => ({
    item,
    entry: byItem.get(item.id),
  }));

  return ok({ profile, region, lines });
}

import {
  applyHouseholdPatch,
  isEmptyHouseholdPatch,
  regionForState,
  stateForZip,
  type FemaRegionId,
  type HouseholdPatch,
  type HouseholdProfile,
  type ProfileRepository,
  type StateCode,
} from "@cafe-listo/shared";
import { validateHousehold } from "@cafe-listo/shared/household";
import { fail, ok, type Clock, type UseCaseResult } from "./types";

export interface SetHouseholdInput {
  userId: string;
  /** USPS two-letter code, any case. */
  state?: string;
  /** Five-digit ZIP, optionally ZIP+4; only the first five digits are kept. */
  zip?: string;
  household: HouseholdPatch;
}

interface Location {
  region: FemaRegionId;
  state: StateCode;
  zip: string | null;
}

type LocationResult =
  | { ok: true; location: Location }
  | { ok: false; message: string };

/**
 * Resolves the location to store. A ZIP is cut to five digits and its state
 * looked up; a state is checked against the FEMA region table. Neither one
 * keeps the stored location, and a new state without a ZIP drops a stored
 * ZIP from another state.
 */
function resolveLocation(
  input: SetHouseholdInput,
  existing: HouseholdProfile | null,
): LocationResult {
  const zip = input.zip?.trim().slice(0, 5);
  const zipState = input.zip === undefined ? undefined : stateForZip(input.zip);
  if (input.zip !== undefined && !zipState) {
    return {
      ok: false,
      message: `Unknown ZIP code "${input.zip}". Ask the user to confirm their 5-digit US ZIP code, or ask for their state instead.`,
    };
  }

  if (input.state !== undefined) {
    const region = regionForState(input.state);
    if (!region) {
      return {
        ok: false,
        message: `Unknown state "${input.state}". Use a two-letter USPS code for a US state, DC, or territory (for example "AZ"); ask the user if unsure.`,
      };
    }
    const state = input.state.trim().toUpperCase() as StateCode;
    if (zipState && zipState !== state) {
      return {
        ok: false,
        message: `ZIP code ${zip} is in ${zipState}, not ${state}. Ask the user which is right, then send only that one.`,
      };
    }
    const keptZip = existing?.state === state ? existing.zip : null;
    return {
      ok: true,
      location: { region: region.id, state, zip: zip ?? keptZip },
    };
  }

  if (zipState && zip) {
    const region = regionForState(zipState);
    if (region) {
      return {
        ok: true,
        location: { region: region.id, state: zipState, zip },
      };
    }
  }

  if (existing) {
    const { region, state, zip: storedZip } = existing;
    return { ok: true, location: { region, state, zip: storedZip } };
  }
  return {
    ok: false,
    message:
      "No location saved yet. Ask the user for their state or ZIP code, then call set_household again with it.",
  };
}

export class SetHousehold {
  constructor(
    private readonly repo: ProfileRepository,
    private readonly clock: Clock,
  ) {}

  /** Partial update: fields left out keep their stored value. */
  async execute(
    input: SetHouseholdInput,
  ): Promise<UseCaseResult<HouseholdProfile>> {
    if (
      input.state === undefined &&
      input.zip === undefined &&
      isEmptyHouseholdPatch(input.household)
    ) {
      return fail(
        "unprocessable",
        "Nothing to update. Send state or zip, or at least one household field.",
      );
    }

    const existing = await this.repo.get(input.userId);

    const location = resolveLocation(input, existing);
    if (!location.ok) return fail("unprocessable", location.message);

    const household = validateHousehold(
      applyHouseholdPatch(existing?.household ?? null, input.household),
    );
    if (!household.ok) {
      return fail(
        "unprocessable",
        `Invalid household: ${household.message}. Ask the user for the missing or corrected details rather than guessing.`,
      );
    }

    const profile: HouseholdProfile = {
      ...location.location,
      household: household.household,
      updatedAt: this.clock.now(),
    };
    await this.repo.save(input.userId, profile);
    return ok(profile);
  }
}

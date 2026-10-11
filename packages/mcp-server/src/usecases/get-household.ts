import type { HouseholdProfile, ProfileRepository } from "@cafe-listo/shared";
import { ok, type UseCaseResult } from "./types";

export class GetHousehold {
  constructor(private readonly repo: ProfileRepository) {}

  /** The caller's profile, or null if they have not saved one yet. */
  async execute(input: {
    userId: string;
  }): Promise<UseCaseResult<HouseholdProfile | null>> {
    return ok(await this.repo.get(input.userId));
  }
}

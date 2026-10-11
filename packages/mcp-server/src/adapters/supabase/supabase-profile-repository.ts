import {
  isStateCode,
  RepositoryError,
  type FemaRegionId,
  type HouseholdProfile,
  type ProfileRepository,
} from "@cafe-listo/shared";
import { householdSchema } from "@cafe-listo/shared/household";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { toRepositoryError } from "./errors";

const rowSchema = z.object({
  region: z.number().int().min(1).max(10),
  state: z.string().refine(isStateCode),
  zip: z
    .string()
    .regex(/^\d{5}$/)
    .nullable(),
  household: householdSchema,
  updated_at: z.iso.datetime({ offset: true }),
});

function rowToProfile(row: unknown): HouseholdProfile {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) {
    throw new RepositoryError(
      "INVALID_ROW",
      `household_profiles row failed validation: ${parsed.error.message}`,
    );
  }
  return {
    region: parsed.data.region as FemaRegionId,
    state: parsed.data.state,
    zip: parsed.data.zip,
    household: parsed.data.household,
    updatedAt: new Date(parsed.data.updated_at),
  };
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async get(userId: string): Promise<HouseholdProfile | null> {
    const { data, error } = await this.client
      .from("household_profiles")
      .select("region, state, zip, household, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw toRepositoryError(error);
    return data ? rowToProfile(data) : null;
  }

  async save(userId: string, profile: HouseholdProfile): Promise<void> {
    const { error } = await this.client.from("household_profiles").upsert(
      {
        user_id: userId,
        region: profile.region,
        state: profile.state,
        zip: profile.zip,
        household: { ...profile.household },
        updated_at: profile.updatedAt.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw toRepositoryError(error);
  }
}

import { describe, expect, it } from "vitest";
import { RepositoryError, type HouseholdProfile } from "@cafe-listo/shared";
import { SupabaseProfileRepository } from "../supabase-profile-repository";
import { createFakeSupabase } from "./fake-supabase";

const USER = "11111111-1111-1111-1111-111111111111";

const household = {
  adults: 2,
  seniors: 0,
  children: { count: 0 },
  infants: 0,
  pets: { dogs: 1, cats: 0, other: 0 },
  medical: { needs: [], flags: [] },
  dietary: [],
  days: 3,
};

const profile: HouseholdProfile = {
  region: 9,
  state: "AZ",
  zip: "85201",
  household,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("SupabaseProfileRepository", () => {
  describe("get", () => {
    it("selects the user's row and maps it to a profile", async () => {
      const { client, calls } = createFakeSupabase({
        data: {
          region: 9,
          state: "AZ",
          zip: "85201",
          household,
          updated_at: "2026-01-01T00:00:00+00:00",
        },
      });

      const result = await new SupabaseProfileRepository(client).get(USER);

      expect(result).toEqual(profile);
      expect(calls).toEqual([
        { method: "from", args: ["household_profiles"] },
        {
          method: "select",
          args: ["region, state, zip, household, updated_at"],
        },
        { method: "eq", args: ["user_id", USER] },
        { method: "maybeSingle", args: [] },
      ]);
    });

    it("returns null when the user has no profile", async () => {
      const { client } = createFakeSupabase({ data: null });

      expect(await new SupabaseProfileRepository(client).get(USER)).toBeNull();
    });

    it("fills household defaults from older rows", async () => {
      const { client } = createFakeSupabase({
        data: {
          region: 9,
          state: "AZ",
          zip: null,
          household: { adults: 1 },
          updated_at: "2026-01-01T00:00:00+00:00",
        },
      });

      const result = await new SupabaseProfileRepository(client).get(USER);

      expect(result?.household.days).toBe(3);
      expect(result?.zip).toBeNull();
    });

    it("rejects rows that do not match the schema", async () => {
      const { client } = createFakeSupabase({
        data: {
          region: 11,
          state: "ZZ",
          zip: "123 Main St",
          household: {},
          updated_at: "x",
        },
      });

      await expect(
        new SupabaseProfileRepository(client).get(USER),
      ).rejects.toMatchObject({ code: "INVALID_ROW" });
    });

    it("wraps query errors", async () => {
      const { client } = createFakeSupabase({
        error: { code: "42501", message: "permission denied" },
      });

      const error = await new SupabaseProfileRepository(client)
        .get(USER)
        .catch((e) => e);

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error.code).toBe("QUERY_FAILED");
    });
  });

  describe("save", () => {
    it("upserts one row keyed on the user", async () => {
      const { client, calls } = createFakeSupabase();

      await new SupabaseProfileRepository(client).save(USER, profile);

      expect(calls).toEqual([
        { method: "from", args: ["household_profiles"] },
        {
          method: "upsert",
          args: [
            {
              user_id: USER,
              region: 9,
              state: "AZ",
              zip: "85201",
              household,
              updated_at: "2026-01-01T00:00:00.000Z",
            },
            { onConflict: "user_id" },
          ],
        },
      ]);
    });

    it("wraps write errors", async () => {
      const { client } = createFakeSupabase({
        error: { message: "new row violates row-level security policy" },
      });

      await expect(
        new SupabaseProfileRepository(client).save(USER, profile),
      ).rejects.toBeInstanceOf(RepositoryError);
    });
  });
});

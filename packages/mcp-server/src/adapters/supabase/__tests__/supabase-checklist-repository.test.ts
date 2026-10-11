import { describe, expect, it } from "vitest";
import { ConflictError, RepositoryError } from "@cafe-listo/shared";
import { SupabaseChecklistRepository } from "../supabase-checklist-repository";
import { createFakeSupabase } from "./fake-supabase";

const USER = "11111111-1111-1111-1111-111111111111";

describe("SupabaseChecklistRepository", () => {
  describe("getEntries", () => {
    it("selects the user's rows and maps them to entries", async () => {
      const { client, calls } = createFakeSupabase({
        data: [
          {
            item_id: "water-1",
            status: "packed",
            quantity: 2,
            packed_at: "2025-12-31T00:00:00+00:00",
            expires_on: "2027-06-30",
            updated_at: "2026-01-01T00:00:00+00:00",
          },
          {
            item_id: "food-1",
            status: "needed",
            quantity: null,
            packed_at: null,
            expires_on: null,
            updated_at: "2026-01-01T00:00:00+00:00",
          },
        ],
      });

      const entries = await new SupabaseChecklistRepository(client).getEntries(
        USER,
      );

      expect(entries).toEqual([
        {
          itemId: "water-1",
          status: "packed",
          quantity: 2,
          packedAt: new Date("2025-12-31T00:00:00Z"),
          expiresOn: "2027-06-30",
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          itemId: "food-1",
          status: "needed",
          quantity: null,
          packedAt: null,
          expiresOn: null,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]);
      expect(calls).toEqual([
        { method: "from", args: ["checklist_entries"] },
        {
          method: "select",
          args: [
            "item_id, status, quantity, packed_at, expires_on, updated_at",
          ],
        },
        { method: "eq", args: ["user_id", USER] },
      ]);
    });

    it("rejects rows that do not match the schema", async () => {
      const { client } = createFakeSupabase({
        data: [
          {
            item_id: "water-1",
            status: "lost",
            quantity: null,
            packed_at: null,
            expires_on: null,
            updated_at: "2026-01-01T00:00:00+00:00",
          },
        ],
      });

      await expect(
        new SupabaseChecklistRepository(client).getEntries(USER),
      ).rejects.toMatchObject({ code: "INVALID_ROW" });
    });

    it("wraps query errors", async () => {
      const { client } = createFakeSupabase({
        error: { code: "42501", message: "permission denied" },
      });

      const error = await new SupabaseChecklistRepository(client)
        .getEntries(USER)
        .catch((e) => e);

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error.code).toBe("QUERY_FAILED");
    });
  });

  describe("saveEntries", () => {
    const entry = {
      itemId: "water-1",
      status: "packed" as const,
      quantity: 3,
      packedAt: new Date("2026-01-01T00:00:00Z"),
      expiresOn: "2027-01-01",
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    };

    it("upserts every entry in one call, keyed on user and item, with done in sync", async () => {
      const { client, calls } = createFakeSupabase();

      await new SupabaseChecklistRepository(client).saveEntries(USER, [
        entry,
        {
          ...entry,
          itemId: "food-1",
          status: "bought",
          packedAt: null,
          expiresOn: null,
        },
      ]);

      expect(calls).toEqual([
        { method: "from", args: ["checklist_entries"] },
        {
          method: "upsert",
          args: [
            [
              {
                user_id: USER,
                item_id: "water-1",
                done: true,
                status: "packed",
                quantity: 3,
                packed_at: "2026-01-01T00:00:00.000Z",
                expires_on: "2027-01-01",
                updated_at: "2026-01-02T00:00:00.000Z",
              },
              {
                user_id: USER,
                item_id: "food-1",
                done: false,
                status: "bought",
                quantity: 3,
                packed_at: null,
                expires_on: null,
                updated_at: "2026-01-02T00:00:00.000Z",
              },
            ],
            { onConflict: "user_id,item_id" },
          ],
        },
      ]);
    });

    it("skips the round trip for an empty batch", async () => {
      const { client, calls } = createFakeSupabase();

      await new SupabaseChecklistRepository(client).saveEntries(USER, []);

      expect(calls).toEqual([]);
    });

    it("maps unique violations to ConflictError", async () => {
      const { client } = createFakeSupabase({
        error: { code: "23505", message: "duplicate key" },
      });

      await expect(
        new SupabaseChecklistRepository(client).saveEntries(USER, [entry]),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("reset", () => {
    it("deletes only the user's rows", async () => {
      const { client, calls } = createFakeSupabase();

      await new SupabaseChecklistRepository(client).reset(USER);

      expect(calls).toEqual([
        { method: "from", args: ["checklist_entries"] },
        { method: "delete", args: [] },
        { method: "eq", args: ["user_id", USER] },
      ]);
    });
  });
});

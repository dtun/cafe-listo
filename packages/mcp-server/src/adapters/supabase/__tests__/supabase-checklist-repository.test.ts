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
            done: true,
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
          done: true,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]);
      expect(calls).toEqual([
        { method: "from", args: ["checklist_entries"] },
        { method: "select", args: ["item_id, done, updated_at"] },
        { method: "eq", args: ["user_id", USER] },
      ]);
    });

    it("rejects rows that do not match the schema", async () => {
      const { client } = createFakeSupabase({
        data: [{ item_id: "water-1", done: "yes", updated_at: "x" }],
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

  describe("setDone", () => {
    it("upserts one row keyed on user and item", async () => {
      const { client, calls } = createFakeSupabase();

      await new SupabaseChecklistRepository(client).setDone(
        USER,
        "water-1",
        true,
        new Date("2026-01-01T00:00:00Z"),
      );

      expect(calls).toEqual([
        { method: "from", args: ["checklist_entries"] },
        {
          method: "upsert",
          args: [
            {
              user_id: USER,
              item_id: "water-1",
              done: true,
              updated_at: "2026-01-01T00:00:00.000Z",
            },
            { onConflict: "user_id,item_id" },
          ],
        },
      ]);
    });

    it("maps unique violations to ConflictError", async () => {
      const { client } = createFakeSupabase({
        error: { code: "23505", message: "duplicate key" },
      });

      await expect(
        new SupabaseChecklistRepository(client).setDone(
          USER,
          "water-1",
          true,
          new Date(),
        ),
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

import { describe, expect, it } from "vitest";
import { RepositoryError } from "@cafe-listo/shared";
import { SupabaseFeedbackRepository } from "../supabase-feedback-repository";
import { createFakeSupabase } from "./fake-supabase";

const USER = "11111111-1111-1111-1111-111111111111";
const ID = "00000000-0000-4000-8000-000000000001";

describe("SupabaseFeedbackRepository", () => {
  it("inserts one row without reading it back (users have no SELECT)", async () => {
    const { client, calls } = createFakeSupabase();

    await new SupabaseFeedbackRepository(client).insert({
      id: ID,
      userId: USER,
      kind: "bug",
      summary: "set_item_done failed",
      toolName: "set_item_done",
      createdAt: new Date("2026-10-10T12:00:00Z"),
    });

    expect(calls).toEqual([
      { method: "from", args: ["feedback"] },
      {
        method: "insert",
        args: [
          {
            id: ID,
            user_id: USER,
            kind: "bug",
            summary: "set_item_done failed",
            details: null,
            tool_name: "set_item_done",
            item_id: null,
            user_quote: null,
            created_at: "2026-10-10T12:00:00.000Z",
          },
        ],
      },
    ]);
  });

  it("wraps insert errors", async () => {
    const { client } = createFakeSupabase({
      error: { code: "42501", message: "new row violates row-level security" },
    });

    const error = await new SupabaseFeedbackRepository(client)
      .insert({
        id: ID,
        userId: USER,
        kind: "other",
        summary: "x",
        createdAt: new Date(),
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.code).toBe("QUERY_FAILED");
  });
});

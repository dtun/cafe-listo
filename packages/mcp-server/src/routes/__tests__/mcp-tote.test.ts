import { describe, expect, it } from "vitest";
import { callTool, createTestApp, rpc } from "../../__tests__/fakes/test-app";

async function annotationsOf(name: string) {
  const { app } = createTestApp();
  const body = await (await app.fetch(rpc("tools/list"))).json();
  return body.result.tools.find((t: { name: string }) => t.name === name)
    ?.annotations;
}

describe("update_items", () => {
  it("is a non-destructive, idempotent write", async () => {
    expect(await annotationsOf("update_items")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("updates a batch in one call and returns what was saved", async () => {
    const { app, repo } = createTestApp();

    const result = await callTool(app, "update_items", {
      items: [
        { item_id: "tools-1", status: "bought" },
        { item_id: "food-1", status: "packed", quantity: 2 },
        { item_id: "food-2", expires_on: "2027-03-31" },
      ],
    });

    expect(result.isError).toBe(false);
    expect(result.json()).toEqual({
      updated: [
        {
          item_id: "tools-1",
          status: "bought",
          quantity: null,
          packed_at: null,
          expires_on: null,
        },
        {
          item_id: "food-1",
          status: "packed",
          quantity: 2,
          packed_at: "2026-01-01T00:00:00.000Z",
          expires_on: null,
        },
        {
          item_id: "food-2",
          status: "needed",
          quantity: null,
          packed_at: null,
          expires_on: "2027-03-31",
        },
      ],
    });
    expect(repo.saves).toBe(1);
  });

  it("keeps set_item_done and get_checklist in step with status", async () => {
    const { app } = createTestApp();
    await callTool(app, "update_items", {
      items: [
        { item_id: "water-1", status: "packed" },
        { item_id: "water-2", status: "bought" },
      ],
    });

    const checklist = (await callTool(app, "get_checklist")).json();

    expect(checklist.progress.done).toBe(1);
  });

  it("validates arguments through the registry", async () => {
    const { app, repo } = createTestApp();

    const result = await callTool(app, "update_items", {
      items: [
        { item_id: "food-1" },
        { item_id: "food-2", status: "lost", expires_on: "next year" },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Error: Invalid arguments for update_items:/);
    expect(result.text).toMatch(
      /items\.0: send at least one of status, quantity or expires_on/,
    );
    expect(result.text).toMatch(/items\.1\.status:/);
    expect(result.text).toMatch(
      /items\.1\.expires_on: expires_on must be a date/,
    );
    expect(repo.saves).toBe(0);
  });

  it("rejects an empty batch", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "update_items", { items: [] });

    expect(result.text).toMatch(/items: send at least one item/);
  });

  it("names unknown ids and saves nothing", async () => {
    const { app, repo } = createTestApp();

    const result = await callTool(app, "update_items", {
      items: [
        { item_id: "food-1", status: "packed" },
        { item_id: "nope", status: "packed" },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "Error: Unknown item ids: nope. Nothing was saved; use ids from get_tote.",
    );
    expect(repo.saves).toBe(0);
  });
});

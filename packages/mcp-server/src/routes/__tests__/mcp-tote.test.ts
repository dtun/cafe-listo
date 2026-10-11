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
      openWorldHint: false,
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

describe("get_tote", () => {
  it("is read-only", async () => {
    expect(await annotationsOf("get_tote")).toEqual({
      title: "Get tote progress",
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  it("asks for set_household first when no profile is saved", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "get_tote");

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Error: No household profile saved yet/);
    expect(result.text).toMatch(/call set_household first/i);
  });

  it("returns a concise summary joined with item status", async () => {
    const { app } = createTestApp();
    await callTool(app, "set_household", { state: "AZ", adults: 2 });
    await callTool(app, "update_items", {
      items: [
        { item_id: "water-1", status: "packed" },
        { item_id: "tools-1", status: "bought", expires_on: "2026-01-31" },
      ],
    });

    const tote = (await callTool(app, "get_tote")).json();

    expect(Object.keys(tote)).toEqual([
      "region",
      "readiness_percent",
      "counts",
      "tote",
      "expiring",
      "hazards",
      "items",
    ]);
    expect(tote.region).toEqual({ id: 9, name: expect.any(String) });
    expect(tote.counts).toMatchObject({ packed: 1, bought: 1 });
    expect(tote.readiness_percent).toBeGreaterThan(0);
    expect(tote.readiness_percent).toBeLessThan(100);
    expect(tote.tote).toMatchObject({
      container: expect.any(String),
      planned_fill_percent: expect.any(Number),
      planned_weight_kg: expect.any(Number),
    });
    expect(tote.tote.overflow).toContainEqual({
      item_id: "water-1",
      quantity: expect.any(Number),
      reason: "not-packable",
      hint: expect.any(String),
    });
    expect(tote.tote.warnings[0]).toMatch(/approximate/i);
    // The test clock is fixed at 2026-01-01.
    expect(tote.expiring).toContainEqual({
      item_id: "tools-1",
      name: expect.any(String),
      expires_on: "2026-01-31",
      days_left: 30,
      estimated: false,
    });
    expect(tote.hazards[0]).toEqual({
      hazard: expect.any(String),
      relevance: expect.stringMatching(/^(primary|secondary)$/),
      via: expect.stringMatching(/^(items|essentials)$/),
      covered: false,
      missing: expect.any(Array),
    });
    expect(tote.items.find((i: { id: string }) => i.id === "water-1")).toEqual({
      id: "water-1",
      name: expect.any(String),
      category_id: "water",
      essential: true,
      status: "packed",
      units: expect.any(Number),
      purchase_unit: expect.any(String),
      quantity: null,
      buy_at: "grocery",
    });
  });

  it("reads statuses written by set_item_done", async () => {
    const { app } = createTestApp();
    await callTool(app, "set_household", { state: "AZ", adults: 1 });
    await callTool(app, "set_item_done", { item_id: "water-1", done: true });

    const tote = (await callTool(app, "get_tote")).json();

    expect(tote.counts.packed).toBe(1);
  });
});

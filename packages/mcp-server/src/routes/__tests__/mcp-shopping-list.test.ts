import { describe, expect, it } from "vitest";
import { callTool, createTestApp, rpc } from "../../__tests__/fakes/test-app";

describe("build_shopping_list", () => {
  it("is read-only and closed-world", async () => {
    const { app } = createTestApp();
    const body = await (await app.fetch(rpc("tools/list"))).json();
    const tool = body.result.tools.find(
      (t: { name: string }) => t.name === "build_shopping_list",
    );

    expect(tool.annotations).toEqual({
      title: "Build shopping list",
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([
      "budget_mode",
      "duration_days",
      "has_tote",
      "store_preference",
    ]);
  });

  it("asks for set_household first when no profile is saved", async () => {
    const { app } = createTestApp();

    const result = await callTool(app, "build_shopping_list");

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Error: No household profile saved yet/);
    expect(result.text).toMatch(/call set_household first/i);
    expect(result.text).toMatch(/call build_shopping_list again/);
  });

  it("returns lines grouped by store with the tote first, and saves nothing", async () => {
    const { app, repo, profiles } = createTestApp();
    await callTool(app, "set_household", { state: "AZ", adults: 2 });
    await callTool(app, "update_items", {
      items: [{ item_id: "water-2", status: "bought" }],
    });
    const savesBefore = repo.saves;
    const profileBefore = await profiles.get("alice");

    const result = await callTool(app, "build_shopping_list", {
      duration_days: 7,
    });

    expect(result.isError).toBe(false);
    const list = result.json();
    expect(Object.keys(list)).toEqual([
      "region",
      "days",
      "has_tote",
      "has_tote_inferred",
      "store_preference",
      "budget_mode",
      "counts",
      "stores",
      "gather",
      "later",
      "fit",
      "hazards",
      "sources",
    ]);
    expect(list.days).toBe(7);
    expect(list.stores[0].lines[0]).toMatchObject({
      item_id: "hdx-27-gal-tote",
      quantity: 1,
    });
    const lines: Array<{ item_id: string }> = list.stores.flatMap(
      (s: { lines: unknown[] }) => s.lines,
    );
    const water = lines.find((l) => l.item_id === "water-1");
    expect(lines.map((l) => l.item_id)).not.toContain("water-2");
    // 2 adults × 7 days.
    expect(water).toMatchObject({
      quantity: 14,
      purchase_unit: "1-gallon jug",
      search_term: expect.any(String),
      url: expect.stringMatching(/^https:\/\//),
    });
    expect(repo.saves).toBe(savesBefore);
    expect(await profiles.get("alice")).toEqual(profileBefore);
  });

  it("validates the overrides", async () => {
    const { app } = createTestApp();
    await callTool(app, "set_household", { state: "AZ", adults: 1 });

    const result = await callTool(app, "build_shopping_list", {
      duration_days: 30,
      store_preference: "mall",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(
      /duration_days: duration_days must be at most 14/,
    );
    expect(result.text).toMatch(/store_preference:/);
  });
});

import { CATEGORIES } from "../seed-data";
import {
  buildMcpToolList,
  categoryIdSchema,
  isToolName,
  toolMutates,
  toolRegistry,
  toolSchemas,
  toolWriteHints,
} from "../mcp/tool-registry";

describe("toolRegistry", () => {
  it("has unique tool names", () => {
    const names = toolRegistry.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a non-empty title and description for every tool", () => {
    for (const tool of toolRegistry) {
      expect(tool.title.trim().length).toBeGreaterThan(0);
      expect(tool.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("has write hints for exactly the mutating tools", () => {
    expect(Object.keys(toolWriteHints).sort()).toEqual(
      toolRegistry
        .map((t) => t.name)
        .filter((name) => toolMutates[name])
        .sort(),
    );
  });

  it("exposes the v1 tool set", () => {
    expect(toolRegistry.map((t) => t.name).sort()).toEqual([
      "get_checklist",
      "list_categories",
      "list_items",
      "reset_checklist",
      "set_item_done",
    ]);
  });

  it("classifies every tool as mutating or not", () => {
    for (const tool of toolRegistry) {
      expect(typeof toolMutates[tool.name]).toBe("boolean");
    }
    expect(toolMutates.set_item_done).toBe(true);
    expect(toolMutates.reset_checklist).toBe(true);
    expect(toolMutates.get_checklist).toBe(false);
  });
});

describe("categoryIdSchema", () => {
  it("accepts exactly the seeded category ids", () => {
    expect([...categoryIdSchema.options].sort()).toEqual(
      CATEGORIES.map((c) => c.id).sort(),
    );
  });
});

describe("toolSchemas", () => {
  it("accepts an empty object for argument-less tools", () => {
    expect(toolSchemas.list_categories.safeParse({}).success).toBe(true);
    expect(toolSchemas.get_checklist.safeParse({}).success).toBe(true);
    expect(toolSchemas.reset_checklist.safeParse({}).success).toBe(true);
  });

  it("accepts list_items filters and rejects an unknown category", () => {
    expect(toolSchemas.list_items.safeParse({}).success).toBe(true);
    expect(
      toolSchemas.list_items.safeParse({
        category_id: "water",
        essential_only: true,
      }).success,
    ).toBe(true);
    expect(
      toolSchemas.list_items.safeParse({ category_id: "snacks" }).success,
    ).toBe(false);
    expect(
      toolSchemas.list_items.safeParse({ essential_only: "yes" }).success,
    ).toBe(false);
  });

  it("requires item_id and boolean done for set_item_done", () => {
    expect(
      toolSchemas.set_item_done.safeParse({ item_id: "water-1", done: true })
        .success,
    ).toBe(true);
    expect(
      toolSchemas.set_item_done.safeParse({ item_id: "", done: true }).success,
    ).toBe(false);
    expect(
      toolSchemas.set_item_done.safeParse({ item_id: "water-1", done: "true" })
        .success,
    ).toBe(false);
    expect(toolSchemas.set_item_done.safeParse({ done: true }).success).toBe(
      false,
    );
  });
});

describe("isToolName", () => {
  it("narrows known names only", () => {
    expect(isToolName("list_items")).toBe(true);
    expect(isToolName("drop_tables")).toBe(false);
  });
});

describe("buildMcpToolList", () => {
  it("returns object JSON Schemas without $schema", () => {
    const tools = buildMcpToolList();

    expect(tools).toHaveLength(toolRegistry.length);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema).not.toHaveProperty("$schema");
    }
  });

  it("describes set_item_done arguments", () => {
    const tool = buildMcpToolList().find((t) => t.name === "set_item_done");

    expect(tool?.inputSchema.required).toEqual(["item_id", "done"]);
  });

  it("annotates read-only tools", () => {
    for (const name of [
      "list_categories",
      "list_items",
      "get_checklist",
    ] as const) {
      const tool = buildMcpToolList().find((t) => t.name === name);
      expect(tool?.annotations).toEqual({
        title: tool?.title,
        readOnlyHint: true,
      });
    }
  });

  it("annotates set_item_done as an idempotent, non-destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "set_item_done");

    expect(tool?.annotations).toEqual({
      title: "Mark item packed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("annotates reset_checklist as an idempotent, destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "reset_checklist");

    expect(tool?.annotations).toEqual({
      title: "Reset checklist",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it("derives readOnlyHint from toolMutates", () => {
    for (const tool of buildMcpToolList()) {
      expect(tool.annotations.readOnlyHint).toBe(!toolMutates[tool.name]);
      expect(tool.title).toBe(tool.annotations.title);
    }
  });
});

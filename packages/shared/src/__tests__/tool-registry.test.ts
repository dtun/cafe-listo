import { CATEGORIES } from "../seed-data";
import { SOURCES_RESOURCE_URI } from "../mcp/resources";
import {
  buildMcpToolList,
  categoryIdSchema,
  feedbackKindSchema,
  isToolName,
  mcpServerInstructions,
  TOOL_NAMES,
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
      "build_shopping_list",
      "get_checklist",
      "get_household",
      "get_tote",
      "list_categories",
      "list_items",
      "reset_checklist",
      "set_household",
      "set_item_done",
      "submit_feedback",
      "update_items",
    ]);
  });

  it("lists every registry tool in TOOL_NAMES", () => {
    expect([...TOOL_NAMES].sort()).toEqual(
      toolRegistry.map((t) => t.name).sort(),
    );
  });

  it("classifies every tool as mutating or not", () => {
    for (const tool of toolRegistry) {
      expect(typeof toolMutates[tool.name]).toBe("boolean");
    }
    expect(toolMutates.set_item_done).toBe(true);
    expect(toolMutates.reset_checklist).toBe(true);
    expect(toolMutates.get_checklist).toBe(false);
    expect(toolMutates.submit_feedback).toBe(true);
    expect(toolMutates.get_household).toBe(false);
    expect(toolMutates.set_household).toBe(true);
    expect(toolMutates.get_tote).toBe(false);
    expect(toolMutates.update_items).toBe(true);
    expect(toolMutates.build_shopping_list).toBe(false);
    expect(toolWriteHints.update_items).toEqual({
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("tells the model to ask for missing household details rather than guess", () => {
    for (const name of ["get_household", "set_household"]) {
      const tool = toolRegistry.find((t) => t.name === name);
      expect(tool?.description).toMatch(/ask the user/i);
    }
    const set = toolRegistry.find((t) => t.name === "set_household");
    expect(set?.description).toMatch(/rather than guessing/i);
    expect(set?.description).toMatch(/never send or store a street address/i);
    expect(mcpServerInstructions).toMatch(/rather than guessing/i);
  });

  it("tells the model to get explicit consent before submitting feedback", () => {
    const tool = toolRegistry.find((t) => t.name === "submit_feedback");

    expect(tool?.description).toMatch(/explicit yes/i);
    expect(tool?.description).toMatch(/never include secrets/i);
    expect(tool?.description).toMatch(/more than once/i);
  });

  it("keeps model-facing copy provider-agnostic", () => {
    const copy = [
      mcpServerInstructions,
      ...toolRegistry.map((t) => t.description),
    ].join(" ");

    expect(copy).not.toMatch(/claude|anthropic/i);
  });
});

describe("mcpServerInstructions", () => {
  it("asks for citations by the source titles and URLs the tools return", () => {
    expect(mcpServerInstructions).toMatch(
      /cite those sources by the titles and URLs the tool returns/,
    );
    expect(mcpServerInstructions).toContain(SOURCES_RESOURCE_URI);
  });

  it("mentions submit_feedback and only real tool names", () => {
    expect(mcpServerInstructions).toContain("submit_feedback");
    const mentioned = mcpServerInstructions.match(/\b[a-z]+(?:_[a-z]+)+\b/g);
    for (const name of mentioned ?? []) {
      expect(isToolName(name)).toBe(true);
    }
  });
});

describe("feedbackKindSchema", () => {
  it("accepts exactly the feedback kinds", () => {
    expect([...feedbackKindSchema.options].sort()).toEqual([
      "bug",
      "content_error",
      "gap",
      "idea",
      "other",
    ]);
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
    expect(toolSchemas.get_household.safeParse({}).success).toBe(true);
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

describe("submit_feedback schema", () => {
  const schema = toolSchemas.submit_feedback;

  it("accepts a minimal and a full submission", () => {
    expect(
      schema.safeParse({ kind: "gap", summary: "No pet food" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        kind: "content_error",
        summary: "Water quantity looks low",
        details: "Recommends 1 gallon total for a family of four.",
        tool_name: "list_items",
        item_id: "water-1",
        user_quote: "that can't be right",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown kind, a blank summary, and an unknown tool", () => {
    expect(schema.safeParse({ kind: "rant", summary: "x" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ kind: "bug", summary: "   " }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ kind: "bug", summary: "x", tool_name: "drop_tables" })
        .success,
    ).toBe(false);
  });

  it("enforces length limits", () => {
    const ok = { kind: "idea", summary: "x" } as const;
    expect(schema.safeParse({ ...ok, summary: "a".repeat(500) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...ok, summary: "a".repeat(501) }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...ok, details: "a".repeat(4001) }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ ...ok, user_quote: "a".repeat(1001) }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...ok, item_id: "a".repeat(101) }).success).toBe(
      false,
    );
  });

  it("does not accept a user_id from the caller", () => {
    const parsed = schema.safeParse({
      ...{ kind: "bug", summary: "x" },
      user_id: "bob",
    });

    expect(parsed.success && "user_id" in parsed.data).toBe(false);
  });
});

describe("set_household schema", () => {
  const schema = toolSchemas.set_household;

  it("accepts partial updates with no required fields", () => {
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ pets: { cats: 1 } })).toEqual({ pets: { cats: 1 } });
    expect(
      schema.safeParse({
        state: "az",
        adults: 2,
        children: { count: 2, bands: { toddler: 1, teen: 1 } },
        infants: 1,
        medical: { needs: ["insulin"], flags: ["prescription_meds"] },
        dietary: ["gluten_free"],
        days: 7,
      }).success,
    ).toBe(true);
  });

  it("accepts a five-digit ZIP or ZIP+4 and rejects anything else", () => {
    expect(schema.safeParse({ zip: "85201" }).success).toBe(true);
    expect(schema.safeParse({ zip: "85201-1234" }).success).toBe(true);
    expect(schema.safeParse({ zip: "8520" }).success).toBe(false);
    expect(schema.safeParse({ zip: "123 Main St" }).success).toBe(false);
  });

  it("accepts two-letter state codes only", () => {
    expect(schema.safeParse({ state: "AZ" }).success).toBe(true);
    expect(schema.safeParse({ state: "Arizona" }).success).toBe(false);
  });

  it("rejects bad household values", () => {
    expect(schema.safeParse({ adults: -1 }).success).toBe(false);
    expect(schema.safeParse({ days: 30 }).success).toBe(false);
    expect(schema.safeParse({ dietary: ["paleo"] }).success).toBe(false);
  });

  it("does not accept an address or a user_id from the caller", () => {
    const parsed = schema.safeParse({
      state: "AZ",
      address: "1 Main St",
      user_id: "bob",
    });

    expect(parsed.success && Object.keys(parsed.data)).toEqual(["state"]);
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
        openWorldHint: false,
      });
    }
  });

  it("annotates set_item_done as an idempotent, non-destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "set_item_done");

    expect(tool?.annotations).toEqual({
      title: "Mark item packed",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it("annotates reset_checklist as an idempotent, destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "reset_checklist");

    expect(tool?.annotations).toEqual({
      title: "Reset checklist",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it("annotates submit_feedback as a non-idempotent, non-destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "submit_feedback");

    expect(tool?.annotations).toEqual({
      title: "Send feedback",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(tool?.inputSchema.required).toEqual(["kind", "summary"]);
  });

  it("annotates get_household as read-only", () => {
    const tool = buildMcpToolList().find((t) => t.name === "get_household");

    expect(tool?.annotations).toEqual({
      title: "Get household profile",
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  it("annotates set_household as an idempotent, non-destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "set_household");

    expect(tool?.annotations).toEqual({
      title: "Save household profile",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(tool?.inputSchema.required).toBeUndefined();
    expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual([
      "adults",
      "children",
      "days",
      "dietary",
      "infants",
      "medical",
      "pets",
      "seniors",
      "state",
      "zip",
    ]);
  });

  it("annotates get_tote as read-only", () => {
    const tool = buildMcpToolList().find((t) => t.name === "get_tote");

    expect(tool?.annotations).toEqual({
      title: "Get tote progress",
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  it("annotates update_items as an idempotent, non-destructive write", () => {
    const tool = buildMcpToolList().find((t) => t.name === "update_items");

    expect(tool?.annotations).toEqual({
      title: "Update tote items",
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    expect(tool?.inputSchema.required).toEqual(["items"]);
  });

  it("marks every tool closed-world: they touch only Cafe Listo's own data", () => {
    for (const tool of buildMcpToolList()) {
      expect(tool.annotations.openWorldHint).toBe(false);
    }
  });

  it("derives readOnlyHint from toolMutates", () => {
    for (const tool of buildMcpToolList()) {
      expect(tool.annotations.readOnlyHint).toBe(!toolMutates[tool.name]);
      expect(tool.title).toBe(tool.annotations.title);
    }
  });
});

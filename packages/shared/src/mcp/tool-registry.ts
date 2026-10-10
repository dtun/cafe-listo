import { z } from "zod";
import { CategoryId } from "../types";

/**
 * Single source of truth for MCP tools: names, model-facing descriptions, and
 * input schemas. Wire shape is snake_case. Item ids are checked against the
 * catalog by the use cases (an unknown id is "not found"), not here.
 */

export const categoryIdSchema = z.enum([
  "water",
  "food",
  "medical",
  "shelter",
  "tools",
  "comms",
  "documents",
  "morale",
] as const satisfies readonly CategoryId[]);

export interface ToolDefinition {
  name: string;
  /** Human-readable name shown in client UIs. */
  title: string;
  description: string;
  inputSchema: z.ZodObject;
}

export const toolRegistry = [
  {
    name: "list_categories",
    title: "List categories",
    description:
      "List the prep box categories (id, label, emoji). Call this to learn valid category ids before filtering items.",
    inputSchema: z.object({}),
  },
  {
    name: "list_items",
    title: "List catalog items",
    description:
      "List prep box items from the catalog: id, name, category, whether it is essential, recommended quantity, and a regional note. Optionally filter by category or to essentials only. Does not include the user's progress — use get_checklist for that.",
    inputSchema: z.object({
      category_id: categoryIdSchema.optional(),
      essential_only: z.boolean().optional(),
    }),
  },
  {
    name: "get_checklist",
    title: "Get checklist",
    description:
      "Get the user's checklist: every item with its done state, plus overall and per-category progress. Call this before answering questions about what the user has or still needs.",
    inputSchema: z.object({}),
  },
  {
    name: "set_item_done",
    title: "Mark item packed",
    description:
      "Mark one item as packed (done: true) or not packed (done: false) for the user. Idempotent. Use item ids from list_items or get_checklist.",
    inputSchema: z.object({
      item_id: z.string().min(1, { message: "item_id is required" }),
      done: z.boolean(),
    }),
  },
  {
    name: "reset_checklist",
    title: "Reset checklist",
    description:
      "Clear the user's entire checklist so every item is not packed. Destructive — only call when the user explicitly asks to start over.",
    inputSchema: z.object({}),
  },
] as const satisfies ReadonlyArray<ToolDefinition>;

type Registry = typeof toolRegistry;

export type ToolName = Registry[number]["name"];

type SchemaFor<N extends ToolName> = Extract<
  Registry[number],
  { name: N }
>["inputSchema"];

export type ToolArgs<N extends ToolName> = z.output<SchemaFor<N>>;

export const toolSchemas = Object.fromEntries(
  toolRegistry.map((t) => [t.name, t.inputSchema]),
) as { [N in ToolName]: SchemaFor<N> };

const toolNames: ReadonlySet<string> = new Set(toolRegistry.map((t) => t.name));

export function isToolName(name: string): name is ToolName {
  return toolNames.has(name);
}

export const toolMutates: Record<ToolName, boolean> = {
  list_categories: false,
  list_items: false,
  get_checklist: false,
  set_item_done: true,
  reset_checklist: true,
};

/** Behavior hints for tools that write (toolMutates). Only meaningful when readOnlyHint is false. */
export const toolWriteHints: Partial<
  Record<ToolName, { destructiveHint: boolean; idempotentHint: boolean }>
> = {
  set_item_done: { destructiveHint: false, idempotentHint: true },
  reset_checklist: { destructiveHint: true, idempotentHint: true },
};

/** MCP tool annotations (hints for clients, not guarantees). */
export interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface McpToolListing {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
  annotations: McpToolAnnotations;
}

function annotationsFor(name: ToolName, title: string): McpToolAnnotations {
  if (!toolMutates[name]) return { title, readOnlyHint: true };
  return {
    title,
    readOnlyHint: false,
    ...toolWriteHints[name],
  };
}

export function buildMcpToolList(): McpToolListing[] {
  return toolRegistry.map((tool) => {
    const inputSchema = z.toJSONSchema(tool.inputSchema, {
      io: "input",
    }) as McpToolListing["inputSchema"];
    delete inputSchema.$schema;
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema,
      annotations: annotationsFor(tool.name, tool.title),
    };
  });
}

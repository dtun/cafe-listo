import { z } from "zod";
import type { FeedbackKind } from "../feedback/ports";
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

export const feedbackKindSchema = z.enum([
  "gap",
  "bug",
  "content_error",
  "idea",
  "other",
] as const satisfies readonly FeedbackKind[]);

/** Every tool name, so submit_feedback can reference tools (a test keeps this in sync with the registry). */
export const TOOL_NAMES = [
  "list_categories",
  "list_items",
  "get_checklist",
  "set_item_done",
  "reset_checklist",
  "submit_feedback",
] as const;

/** Sent in the MCP initialize result. Provider-agnostic: standard MCP only. */
export const mcpServerInstructions =
  "Cafe Listo helps people build an emergency prep box. Use list_categories and list_items to browse the catalog, and get_checklist, set_item_done, and reset_checklist to track what the user has packed. If the user wants something the catalog lacks, the guidance looks wrong for their situation, a tool fails or can't do what they asked, or they seem frustrated, offer once to send feedback to the Cafe Listo team with submit_feedback. Tell them exactly what you will send and only call it after they say yes.";

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
  {
    name: "submit_feedback",
    title: "Send feedback",
    description:
      "Send feedback to the Cafe Listo team on the user's behalf so it can be fixed or added. Offer it when the user wants something the catalog lacks, the guidance looks wrong for their situation, a tool errors or can't do what was asked, or the user expresses frustration. Before calling, always show the user a short summary of exactly what will be sent and get an explicit yes. Never include secrets, passwords, or personal information the user didn't share for this purpose. Don't offer more than once for the same issue in a conversation. Put the user's own words in user_quote, the tool involved in tool_name, and the catalog item in item_id when relevant.",
    inputSchema: z.object({
      kind: feedbackKindSchema,
      summary: z
        .string()
        .trim()
        .min(1, { message: "summary is required" })
        .max(500),
      details: z.string().trim().max(4000).optional(),
      tool_name: z.enum(TOOL_NAMES).optional(),
      item_id: z.string().trim().min(1).max(100).optional(),
      user_quote: z.string().trim().max(1000).optional(),
    }),
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
  submit_feedback: true,
};

/** Behavior hints for tools that write (toolMutates). Only meaningful when readOnlyHint is false. */
export const toolWriteHints: Partial<
  Record<ToolName, { destructiveHint: boolean; idempotentHint: boolean }>
> = {
  set_item_done: { destructiveHint: false, idempotentHint: true },
  reset_checklist: { destructiveHint: true, idempotentHint: true },
  submit_feedback: { destructiveHint: false, idempotentHint: false },
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

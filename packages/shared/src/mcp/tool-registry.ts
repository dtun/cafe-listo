import { z } from "zod";
import { ITEM_STATUSES } from "../checklist/ports";
import type { FeedbackKind } from "../feedback/ports";
import { householdPatchSchema } from "../household/schema";
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
  "get_household",
  "set_household",
  "update_items",
] as const;

/** Sent in the MCP initialize result. Provider-agnostic: standard MCP only. */
export const mcpServerInstructions =
  "Cafe Listo helps people build an emergency prep box. Use list_categories and list_items to browse the catalog, and get_checklist, set_item_done, and reset_checklist to track what the user has packed. Use get_household to recall where the user lives and who they are preparing for, and set_household to save it; ask the user for missing details rather than guessing. If the user wants something the catalog lacks, the guidance looks wrong for their situation, a tool fails or can't do what they asked, or they seem frustrated, offer once to send feedback to the Cafe Listo team with submit_feedback. Tell them exactly what you will send and only call it after they say yes.";

export const itemStatusSchema = z.enum(ITEM_STATUSES);

/** One item's change in update_items: item_id plus at least one field. */
export const itemUpdateSchema = z
  .object({
    item_id: z
      .string()
      .trim()
      .min(1, { message: "item_id is required" })
      .max(100),
    status: itemStatusSchema.optional(),
    quantity: z.number().int().min(0).max(10_000).optional(),
    expires_on: z.iso
      .date({ message: "expires_on must be a date such as 2027-03-31" })
      .nullable()
      .optional(),
  })
  .refine(
    (u) =>
      u.status !== undefined ||
      u.quantity !== undefined ||
      u.expires_on !== undefined,
    { message: "send at least one of status, quantity or expires_on" },
  );

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
  {
    name: "get_household",
    title: "Get household profile",
    description:
      "Get the user's saved household profile: location (state, optional ZIP, and the FEMA region derived from them) and who they are preparing for (adults, seniors, children, infants, pets, medical and dietary needs, and how many days to plan for). Returns profile: null if nothing is saved yet; then ask the user about their household and location rather than assuming. Call this before tailoring advice or quantities to the user.",
    inputSchema: z.object({}),
  },
  {
    name: "set_household",
    title: "Save household profile",
    description:
      'Save or update the user\'s household profile. Partial update: send only what the user told you; omitted fields keep their saved values. pets and medical merge per key; other fields replace the saved value (children replaces count and bands together). Location: send state (two-letter code such as "AZ") or zip (5-digit US ZIP); the FEMA region is derived. Never send or store a street address. The first save needs a location and at least one person. Ask the user for any missing or unclear details rather than guessing; never invent counts, ages, pets, medical needs, or location. adults are 18–64, seniors 65+, children 1–17 (bands: toddler 1–3, child 4–12, teen 13–17), infants under 1. days is how long to prepare for (default 3, max 14).',
    inputSchema: householdPatchSchema.extend({
      state: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/, {
          message: "state must be a two-letter code such as AZ",
        })
        .optional(),
      zip: z
        .string()
        .trim()
        .regex(/^\d{5}(?:-?\d{4})?$/, {
          message: "zip must be a 5-digit US ZIP code",
        })
        .optional(),
    }),
  },
  {
    name: "update_items",
    title: "Update tote items",
    description:
      'Update one or more items in one call: status (needed, bought or packed), quantity (purchase units the user has), or expires_on (the date printed on the label, YYYY-MM-DD, or null to clear it). Omitted fields keep their saved values; moving an item back to needed clears its quantity. Batch related changes: for "I bought everything on the hardware list", send every item on that list with status bought in one call. Idempotent. All or nothing: an unknown or repeated item id rejects the whole batch. Ask the user rather than guessing quantities or dates.',
    inputSchema: z.object({
      items: z
        .array(itemUpdateSchema)
        .min(1, { message: "send at least one item" })
        .max(100),
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
  get_household: false,
  set_household: true,
  update_items: true,
};

/** Behavior hints for tools that write (toolMutates). Only meaningful when readOnlyHint is false. */
export const toolWriteHints: Partial<
  Record<ToolName, { destructiveHint: boolean; idempotentHint: boolean }>
> = {
  set_item_done: { destructiveHint: false, idempotentHint: true },
  reset_checklist: { destructiveHint: true, idempotentHint: true },
  submit_feedback: { destructiveHint: false, idempotentHint: false },
  set_household: { destructiveHint: false, idempotentHint: true },
  update_items: { destructiveHint: false, idempotentHint: true },
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

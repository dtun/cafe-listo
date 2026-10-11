import { z } from "zod";
import { isStateCode } from "../data/fema-regions";
import { DEFAULT_HOUSEHOLD_DAYS, MAX_HOUSEHOLD_DAYS } from "../household/types";

/**
 * MCP prompts: user-chosen templates (a client shows them as slash commands
 * or a menu). Model-facing copy, so keep it provider-agnostic like the tool
 * registry. Prompt arguments are always strings on the wire.
 */

export const PREP_MY_TOTE_PROMPT = "prep_my_tote";

export const PROMPT_NAMES = [PREP_MY_TOTE_PROMPT] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];

export interface McpPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPromptListing {
  name: PromptName;
  title: string;
  description: string;
  arguments: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: "user";
  content: { type: "text"; text: string };
}

export interface RenderedPrompt {
  description: string;
  messages: McpPromptMessage[];
}

const ZIP_PATTERN = /^(\d{5})(?:-?\d{4})?$/;

/**
 * A state code or ZIP, never finer. A ZIP+4 is cut to its five digits so the
 * prompt never carries more than set_household would store.
 */
export const promptLocationSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const zip = ZIP_PATTERN.exec(value);
    if (zip) return { zip: zip[1] } as const;
    const state = value.toUpperCase();
    if (isStateCode(state)) return { state } as const;
    ctx.addIssue({
      code: "custom",
      message:
        "location must be a two-letter US state code such as AZ or a 5-digit ZIP code; never a street address",
    });
    return z.NEVER;
  });

export const promptArgSchemas = {
  [PREP_MY_TOTE_PROMPT]: z.strictObject({
    location: promptLocationSchema.optional(),
  }),
} satisfies Record<PromptName, z.ZodType>;

const promptListings: Record<PromptName, McpPromptListing> = {
  [PREP_MY_TOTE_PROMPT]: {
    name: PREP_MY_TOTE_PROMPT,
    title: "Prep my tote",
    description:
      "Walk through building an emergency tote: confirm your state or ZIP, answer a few questions about your household, save it, get a shopping list grouped by store, and track what you buy.",
    arguments: [
      {
        name: "location",
        description:
          "Optional. Your two-letter US state code (e.g. AZ) or 5-digit ZIP code. Never a street address.",
        required: false,
      },
    ],
  },
};

const ADDRESS_RULE =
  "Ask only for a two-letter state code or a 5-digit ZIP code; never ask for, repeat, or save a street address.";

function locationStep(
  location: z.output<typeof promptLocationSchema> | undefined,
): string {
  const given = !location
    ? ""
    : "state" in location
      ? ` I said I'm in ${location.state}; confirm that with me before saving it.`
      : ` I said my ZIP is ${location.zip}; confirm that with me before saving it.`;
  return `1. Location. Call get_household to see what is already saved.${given} If nothing is saved, ask where I live. ${ADDRESS_RULE}`;
}

function renderPrepMyTote(
  args: z.output<(typeof promptArgSchemas)[typeof PREP_MY_TOTE_PROMPT]>,
): RenderedPrompt {
  const text = [
    "Help me prep my emergency tote with Cafe Listo. Go one step at a time and wait for my answers.",
    "",
    locationStep(args.location),
    `2. Household. Ask who I'm preparing for: adults (18-64), seniors (65+), children and their ages, infants under 1, pets, medical or dietary needs, and how many days to plan for (${DEFAULT_HOUSEHOLD_DAYS} by default, up to ${MAX_HOUSEHOLD_DAYS}). If a household is saved, show it and ask whether it is still right instead of asking everything again. Ask rather than guess; never invent counts, ages, pets, or needs.`,
    "3. Save. Call set_household with only what I told you or confirmed.",
    "4. Shopping list. Ask whether I already own the tote and whether I want essentials first on a budget, then call build_shopping_list (has_tote, budget_mode). Show the list grouped by store with the quantity and search link for each line, then what to gather at home and what is stored beside the tote. When you explain why an item or quantity is there, cite the source titles and URLs the tool returned.",
    "5. Track. Offer to record what I buy or pack with update_items, batching everything from one trip into one call.",
  ].join("\n");
  return {
    description: promptListings[PREP_MY_TOTE_PROMPT].description,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}

export function isPromptName(name: string): name is PromptName {
  return (PROMPT_NAMES as readonly string[]).includes(name);
}

export function buildMcpPromptList(): McpPromptListing[] {
  return PROMPT_NAMES.map((name) => promptListings[name]);
}

export type PromptRenderResult =
  | { ok: true; prompt: RenderedPrompt }
  | { ok: false; message: string };

/** Validates the string arguments and renders the prompt's messages. */
export function renderMcpPrompt(
  name: PromptName,
  rawArgs: Record<string, string> | undefined,
): PromptRenderResult {
  const parsed = promptArgSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, message: `Invalid arguments for ${name}: ${details}` };
  }
  return { ok: true, prompt: renderPrepMyTote(parsed.data) };
}

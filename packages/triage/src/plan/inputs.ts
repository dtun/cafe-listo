import { feedbackKindSchema } from "@cafe-listo/shared";
import { z } from "zod";
import {
  CREATED_AT_PATTERN,
  UUID_PATTERN,
  isCursor,
  type Cursor,
} from "./cursor";
import { TriagePlanSchema } from "./schema";
import type { FeedbackRecord, IssueRef } from "./types";

/**
 * Everything a run reads from outside is untrusted: supabase rows, gh output,
 * the saved pending plan, and the text handed to the model. These pure
 * functions parse or build it; the CLI only moves bytes.
 */

/**
 * SQL for feedback strictly after the (created_at, id) cursor, oldest first.
 * created_at comes back as fixed-width UTC so (created_at, id) is a valid
 * Cursor. Only a cursor with a valid timestamp and a UUID id is interpolated.
 */
export function feedbackQuery(cursor: Cursor, limit: number): string {
  if (!isCursor(cursor) || !UUID_PATTERN.test(cursor.id)) {
    throw new Error("refusing a malformed cursor");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error(`refusing a bad limit: ${limit}`);
  }
  return [
    "select id, user_id, kind, summary, details, tool_name, item_id, user_quote,",
    `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`,
    "from public.feedback",
    `where (feedback.created_at, feedback.id) > ('${cursor.createdAt}'::timestamptz, '${cursor.id}'::uuid)`,
    `order by feedback.created_at, feedback.id limit ${limit}`,
  ].join(" ");
}

const RowSchema = z.object({
  id: z.string().regex(UUID_PATTERN),
  user_id: z.string(),
  kind: feedbackKindSchema,
  summary: z.string(),
  details: z.string().nullable(),
  tool_name: z.string().nullable(),
  item_id: z.string().nullable(),
  user_quote: z.string().nullable(),
  created_at: z.string().regex(CREATED_AT_PATTERN),
});

/** `supabase db query -o json` output: {boundary, rows, warning}. Only `.rows` go on, as data. */
export function parseFeedbackRows(output: string): FeedbackRecord[] {
  const { rows } = z
    .object({ rows: z.array(RowSchema) })
    .parse(JSON.parse(output));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    summary: r.summary,
    details: r.details,
    toolName: r.tool_name,
    itemId: r.item_id,
    userQuote: r.user_quote,
    createdAt: r.created_at,
  }));
}

export interface Issue extends IssueRef {
  title: string;
  /** Truncated; issue bodies are untrusted text. */
  body: string;
}

const GhIssueSchema = z.object({
  number: z.int(),
  state: z.enum(["OPEN", "CLOSED"]),
  title: z.string(),
  body: z.string().nullish(),
  /** null for deleted ("ghost") accounts. */
  author: z.object({ login: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
});

/** `gh issue list --json number,state,title,labels,body,author` output. */
export function parseIssues(output: string): Issue[] {
  return z
    .array(GhIssueSchema)
    .parse(JSON.parse(output))
    .map((i) => ({
      number: i.number,
      state: i.state,
      title: i.title,
      author: i.author?.login ?? "",
      labels: i.labels.map((l) => l.name),
      body: (i.body ?? "").slice(0, 400),
    }));
}

/** The URL of the first item (issue or comment) whose body carries `marker`. */
export function findMarked(output: string, marker: string): string | null {
  const Item = z.object({ url: z.string(), body: z.string().nullable() });
  const parsed = JSON.parse(output);
  const items = z
    .array(Item)
    .parse(Array.isArray(parsed) ? parsed : parsed.comments);
  return items.find((i) => i.body?.includes(marker))?.url ?? null;
}

/** The last line of `gh issue create|comment` output, which must be a GitHub URL. */
export function parseFiledUrl(output: string): string {
  const url = output.trim().split("\n").pop()?.trim() ?? "";
  if (!/^https:\/\/github\.com\/\S+$/.test(url)) {
    throw new Error("gh did not return a URL");
  }
  return url;
}

/** A validated plan saved before anything is filed, so a failed run resumes it. */
export const PendingPlanSchema = z.strictObject({
  planId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  plan: TriagePlanSchema,
  /** What validatePlan checked the plan against. */
  context: z.strictObject({
    feedbackIds: z.array(z.string()),
    issues: z.array(
      z.strictObject({
        number: z.int(),
        state: z.enum(["OPEN", "CLOSED"]),
        author: z.string(),
        labels: z.array(z.string()),
      }),
    ),
  }),
  advanceTo: z.custom<Cursor>(isCursor),
  done: z.array(
    z.strictObject({ index: z.int().min(0), url: z.string().nullable() }),
  ),
});

export type PendingPlan = z.infer<typeof PendingPlanSchema>;

/**
 * The analyst prompt plus each input as fenced JSON. Backticks are escaped
 * (still valid JSON), so untrusted text can never close its fence.
 */
export function buildPrompt(
  instructions: string,
  sections: Record<string, unknown>,
): string {
  const fenced = (value: unknown) =>
    "```json\n" +
    JSON.stringify(value, null, 2).replace(/`/g, "\\u0060") +
    "\n```";
  return [
    instructions.trimEnd(),
    ...Object.entries(sections).map(([name, v]) => `## ${name}\n${fenced(v)}`),
  ].join("\n\n");
}

/** `claude -p --output-format json` output. Only the error subtype is reported, never model text. */
export function parseAnalyzerOutput(output: string): unknown {
  const result = z
    .object({
      is_error: z.boolean().optional(),
      subtype: z.string().optional(),
      structured_output: z.unknown(),
    })
    .parse(JSON.parse(output));
  if (result.is_error) {
    const subtype = /^[a-z_]{1,40}$/.test(result.subtype ?? "")
      ? result.subtype
      : "unknown";
    throw new Error(`claude reported an error (${subtype})`);
  }
  if (result.structured_output === undefined) {
    throw new Error("claude returned no structured_output");
  }
  return result.structured_output;
}

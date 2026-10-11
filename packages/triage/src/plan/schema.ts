import { z } from "zod";
import type { Problem } from "./types";

/**
 * The shape the analyzer must return. Deliberately flat: per-type rules (a
 * create needs a title, a comment needs an issue number) live in validatePlan,
 * so they report the same Problems whichever adapter produced the plan.
 */
export const TriagePlanSchema = z.strictObject({
  summary: z.string().max(2000),
  actions: z.array(
    z.strictObject({
      type: z.enum(["create_issue", "comment_issue", "skip"]),
      feedback_ids: z.array(z.string()).min(1),
      reason: z.string().max(500),
      title: z.string().max(120).optional(),
      body: z.string().max(6000).optional(),
      labels: z.array(z.string()).optional(),
      issue_number: z.int().min(1).optional(),
    }),
  ),
});

export type TriagePlan = z.infer<typeof TriagePlanSchema>;
export type TriageAction = TriagePlan["actions"][number];

/** JSON Schema for the analyzer's structured output (e.g. `claude --json-schema`). */
export function triagePlanJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(TriagePlanSchema);
  void _ignored;
  return schema;
}

export type ParsedPlan =
  | { ok: true; plan: TriagePlan }
  | { ok: false; problems: Problem[] };

const KNOWN_KEYS = new Set([
  "summary",
  "actions",
  "type",
  "feedback_ids",
  "reason",
  "title",
  "body",
  "labels",
  "issue_number",
]);

/**
 * Parses raw analyzer output. Anything off-schema is a Problem, never a throw.
 * Problems carry only the issue code and a path of known keys and indexes,
 * never a value or key the model wrote.
 */
export function parsePlan(raw: unknown): ParsedPlan {
  const result = TriagePlanSchema.safeParse(raw);
  if (result.success) return { ok: true, plan: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => {
      const path = issue.path
        .map((seg) =>
          typeof seg === "number" || KNOWN_KEYS.has(String(seg)) ? seg : "?",
        )
        .join(".");
      return {
        rule: "schema",
        message: `schema: ${path || "(root)"}: ${issue.code}`,
      };
    }),
  };
}

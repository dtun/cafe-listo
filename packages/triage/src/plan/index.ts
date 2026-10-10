/**
 * TriagePlan module. Interface: the plan schema, reporter aliasing and plan
 * validation. Implementation: added in the next commit.
 */
import type { FeedbackKind } from "@cafe-listo/shared";
import { z } from "zod";

export interface FeedbackRecord {
  id: string;
  userId: string;
  kind: FeedbackKind;
  summary: string;
  details: string | null;
  toolName: string | null;
  itemId: string | null;
  userQuote: string | null;
  createdAt: string;
}

export type Feedback = Omit<FeedbackRecord, "userId"> & { reporter: string };

export const TriagePlanSchema = z.strictObject({
  summary: z.string(),
  actions: z.array(
    z.strictObject({
      type: z.enum(["create_issue", "comment_issue", "skip"]),
      feedback_ids: z.array(z.string()),
      reason: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      labels: z.array(z.string()).optional(),
      issue_number: z.number().optional(),
    }),
  ),
});

export type TriagePlan = z.infer<typeof TriagePlanSchema>;
export type TriageAction = TriagePlan["actions"][number];

export interface TriagePolicy {
  allowedLabels: string[];
  requiredLabels: string[];
  maxActions: number;
  maxComments: number;
  trustedAuthors: string[];
  titlePattern: RegExp;
  scopes: string[];
}

export interface IssueRef {
  number: number;
  state: "OPEN" | "CLOSED";
  author: string;
  labels: string[];
}

export interface PlanContext {
  feedbackIds: string[];
  issues: IssueRef[];
  policy: TriagePolicy;
}

export interface Problem {
  rule: string;
  message: string;
}

export const DEFAULT_POLICY: TriagePolicy = {
  allowedLabels: [],
  requiredLabels: [],
  maxActions: 0,
  maxComments: 0,
  trustedAuthors: [],
  titlePattern: /^$/,
  scopes: [],
};

export function triagePlanJsonSchema(): Record<string, unknown> {
  return {};
}

export function parsePlan(
  raw: unknown,
): { ok: true; plan: TriagePlan } | { ok: false; problems: Problem[] } {
  return { ok: true, plan: raw as TriagePlan };
}

export function aliasReporters(rows: FeedbackRecord[]): Feedback[] {
  return rows.map((row) => ({ ...row, reporter: "" }));
}

export function validatePlan(plan: TriagePlan, ctx: PlanContext): Problem[] {
  void plan;
  void ctx;
  return [];
}

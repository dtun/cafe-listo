import type { TriageAction, TriagePlan } from "./schema";
import type { PlanContext, Problem, TriagePolicy } from "./types";

/** Never allowed, whatever the policy says: humans decide when work starts. */
const FORBIDDEN_LABELS = ["ready-for-agent"];

const SCOPES = ["mcp-server", "shared", "mobile", "landing", "db"];

export const DEFAULT_POLICY: TriagePolicy = Object.freeze({
  allowedLabels: [
    "feedback",
    "needs-triage",
    "feature",
    "bug",
    "documentation",
    "mcp-server",
    "shared",
    "mobile",
    "landing",
  ],
  requiredLabels: ["feedback", "needs-triage"],
  maxActions: 10,
  maxComments: 10,
  trustedAuthors: [],
  titlePattern: /^(?:feat|fix|docs)\((?<scope>[a-z0-9-]+)\): [^\r\n]{5,}$/,
  scopes: SCOPES,
});

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const UUID =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
/**
 * Ten-digit numbers with or without separators, optionally with a country
 * code, and `+CC` international groups. Digit runs on either side don't count,
 * so years, dates and quantities pass. A false positive only rejects the plan.
 */
const PHONE =
  /(?<![0-9])(?:(?:\+[0-9]{1,3}[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}|\+[0-9]{1,3}(?:[\s.-]?[0-9]{2,4}){2,5})(?![0-9])/;
const MENTION = /(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9-]/;
const CROSS_REPO = /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[0-9]/;
const URL = /https?:\/\/|www\./i;
/** Plain #N (not headings, not owner/repo#N, not &#N; entities). */
const ISSUE_REF = /(?<![A-Za-z0-9_/&#])#([0-9]+)/g;

const isBlank = (text: string | undefined) => !text || text.trim() === "";

function actionName(action: TriageAction): string {
  return action.type === "create_issue"
    ? (action.title ?? "")
    : `comment #${action.issue_number}`;
}

function problem(rule: string, message: string): Problem {
  return { rule, message };
}

function coverage(plan: TriagePlan, ctx: PlanContext): Problem[] {
  const referenced = new Set(plan.actions.flatMap((a) => a.feedback_ids));
  const known = new Set(ctx.feedbackIds);
  const unaccounted = ctx.feedbackIds.filter((id) => !referenced.has(id));
  const unknown = [...referenced].filter((id) => !known.has(id));
  return [
    ...(unaccounted.length
      ? [problem("coverage", `unaccounted feedback: ${unaccounted.join(",")}`)]
      : []),
    ...(unknown.length
      ? [problem("coverage", `unknown feedback ids: ${unknown.join(",")}`)]
      : []),
  ];
}

function caps(plan: TriagePlan, policy: TriagePolicy): Problem[] {
  const out: Problem[] = [];
  const acting = plan.actions.filter((a) => a.type !== "skip").length;
  const creates = plan.actions.filter((a) => a.type === "create_issue").length;
  const comments = plan.actions.filter(
    (a) => a.type === "comment_issue",
  ).length;
  if (acting > policy.maxActions) {
    out.push(
      problem("cap", `too many actions: ${acting} > ${policy.maxActions}`),
    );
  }
  if (creates > policy.maxActions) {
    out.push(
      problem("cap", `too many issues: ${creates} > ${policy.maxActions}`),
    );
  }
  if (comments > policy.maxComments) {
    out.push(
      problem("cap", `too many comments: ${comments} > ${policy.maxComments}`),
    );
  }
  return out;
}

function titleOk(title: string | undefined, policy: TriagePolicy): boolean {
  if (title === undefined || /[\r\n]/.test(title)) return false;
  const match = policy.titlePattern.exec(title);
  if (!match) return false;
  const scope = match.groups?.scope;
  return scope === undefined || policy.scopes.includes(scope);
}

function createRules(action: TriageAction, policy: TriagePolicy): Problem[] {
  const out: Problem[] = [];
  const title = action.title ?? "";
  const labels = action.labels ?? [];
  if (!titleOk(action.title, policy)) {
    out.push(problem("title", `bad title: ${title}`));
  }
  if (isBlank(action.body)) {
    out.push(problem("body", `empty body: ${title}`));
  }
  if (!policy.requiredLabels.every((label) => labels.includes(label))) {
    out.push(problem("labels", `missing required labels: ${title}`));
  }
  const disallowed = labels.filter(
    (label) =>
      !policy.allowedLabels.includes(label) || FORBIDDEN_LABELS.includes(label),
  );
  if (disallowed.length) {
    out.push(
      problem(
        "labels",
        `disallowed labels ${disallowed.join(",")} on: ${title}`,
      ),
    );
  }
  return out;
}

function commentRules(action: TriageAction, ctx: PlanContext): Problem[] {
  const n = action.issue_number;
  if (n === undefined) {
    return [problem("comment", "comment without issue_number")];
  }
  const out: Problem[] = [];
  if (isBlank(action.body)) {
    out.push(problem("body", `empty comment on #${n}`));
  }
  const target = ctx.issues.find((issue) => issue.number === n);
  if (!target) {
    out.push(problem("comment", `comment targets unknown issue #${n}`));
  } else if (
    !ctx.policy.trustedAuthors.includes(target.author) &&
    !target.labels.includes("feedback")
  ) {
    out.push(
      problem(
        "comment",
        `comment target #${n} not opened by a trusted author or labelled feedback`,
      ),
    );
  }
  return out;
}

function oneCommentPerIssue(plan: TriagePlan): Problem[] {
  const seen = new Map<number, number>();
  for (const a of plan.actions) {
    if (a.type === "comment_issue" && a.issue_number !== undefined) {
      seen.set(a.issue_number, (seen.get(a.issue_number) ?? 0) + 1);
    }
  }
  return [...seen]
    .filter(([, count]) => count > 1)
    .map(([n]) => problem("comment", `multiple comments on #${n}`));
}

/** Rules for everything that becomes public text: titles and bodies. */
function textRules(action: TriageAction, ctx: PlanContext): Problem[] {
  const name = actionName(action);
  const text = `${action.title ?? ""}\n${action.body ?? ""}`;
  const out: Problem[] = [];
  if (EMAIL.test(text) || UUID.test(text) || PHONE.test(text)) {
    out.push(problem("pii", `possible personal info in: ${name}`));
  }
  if (MENTION.test(text)) {
    out.push(problem("mention", `@-mention in: ${name}`));
  }
  if (CROSS_REPO.test(text)) {
    out.push(problem("reference", `cross-repo reference in: ${name}`));
  }
  if (URL.test(text)) {
    out.push(problem("url", `url in: ${name}`));
  }
  const known = new Set(ctx.issues.map((issue) => issue.number));
  const unknown = [
    ...new Set([...text.matchAll(ISSUE_REF)].map((m) => Number(m[1]))),
  ].filter((n) => !known.has(n));
  if (unknown.length) {
    out.push(
      problem(
        "reference",
        `unknown issue reference ${unknown.map((n) => `#${n}`).join(",")} in: ${name}`,
      ),
    );
  }
  return out;
}

/**
 * The invariant every adapter passes: a plan with any Problem is rejected
 * whole. Pure; the context says what the analyzer was shown and what the
 * policy allows.
 */
export function validatePlan(plan: TriagePlan, ctx: PlanContext): Problem[] {
  return [
    ...coverage(plan, ctx),
    ...caps(plan, ctx.policy),
    ...plan.actions.flatMap((action) =>
      action.type === "create_issue" ? createRules(action, ctx.policy) : [],
    ),
    ...plan.actions.flatMap((action) =>
      action.type === "comment_issue" ? commentRules(action, ctx) : [],
    ),
    ...oneCommentPerIssue(plan),
    ...plan.actions.flatMap((action) =>
      action.type === "skip" ? [] : textRules(action, ctx),
    ),
  ];
}

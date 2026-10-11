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
/**
 * Anything that renders as a link in a public issue, with or without a
 * scheme: URLs, scheme-relative `//host`, any markdown link or image, any raw
 * HTML (anchors, images, comments, autolinks), and bare hosts. Plain `#N`
 * refs, file names and paths without a host don't match.
 */
const LINKS = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /\bwww\./i,
  /(^|[^A-Za-z0-9:/])\/\/[A-Za-z0-9]/,
  /\]\s*[([]/,
  /^\s*\[[^\]]+\]:/m,
  /<[A-Za-z!/]/,
  /\b(?:href|src)\s*=/i,
  /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\//,
  /\b[A-Za-z0-9-]+\.(?:com|net|org|io|co|app|dev|xyz|ly|me|info|biz|ru|cn|example|link|site|online|top)\b/i,
];
/** Plain #N (not headings, not owner/repo#N, not &#N; entities). */
const ISSUE_REF = /(?<![A-Za-z0-9_/&#])#([0-9]+)/g;

const isBlank = (text: string | undefined) => !text || text.trim() === "";

/**
 * Problems end up in logs, so they name actions by index and type and fields
 * by name. They never quote plan or feedback text: the title, the matched
 * PII, labels, or ids the model wrote.
 */
function at(index: number, action: TriageAction): string {
  return `action ${index} (${action.type})`;
}

function problem(rule: string, message: string, action?: number): Problem {
  return action === undefined ? { rule, message } : { rule, message, action };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function coverage(plan: TriagePlan, ctx: PlanContext): Problem[] {
  const known = new Set(ctx.feedbackIds);
  const referenced = new Set(plan.actions.flatMap((a) => a.feedback_ids));
  const unaccounted = ctx.feedbackIds.filter((id) => !referenced.has(id));
  const out: Problem[] = [];
  if (unaccounted.length) {
    out.push(
      problem(
        "coverage",
        `${plural(unaccounted.length, "feedback id")} of ${ctx.feedbackIds.length} in no action`,
      ),
    );
  }
  plan.actions.forEach((action, i) => {
    const unknown = action.feedback_ids.filter((id) => !known.has(id));
    if (unknown.length) {
      out.push(
        problem(
          "coverage",
          `${at(i, action)}: ${plural(unknown.length, "unknown feedback id")}`,
          i,
        ),
      );
    }
  });
  return out;
}

function caps(plan: TriagePlan, policy: TriagePolicy): Problem[] {
  const out: Problem[] = [];
  const count = (type: TriageAction["type"]) =>
    plan.actions.filter((a) => a.type === type).length;
  const creates = count("create_issue");
  const comments = count("comment_issue");
  if (creates + comments > policy.maxActions) {
    out.push(
      problem(
        "cap",
        `too many actions: ${creates + comments} > ${policy.maxActions}`,
      ),
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

function createRules(
  action: TriageAction,
  i: number,
  policy: TriagePolicy,
): Problem[] {
  const out: Problem[] = [];
  const where = at(i, action);
  const labels = action.labels ?? [];
  if (!titleOk(action.title, policy)) {
    out.push(
      problem(
        "title",
        `${where}: title is not a one-line feat|fix|docs(<scope>) title with a known scope`,
        i,
      ),
    );
  }
  if (isBlank(action.body)) {
    out.push(problem("body", `${where}: empty body`, i));
  }
  if (!policy.requiredLabels.every((label) => labels.includes(label))) {
    out.push(problem("labels", `${where}: missing required labels`, i));
  }
  for (const label of FORBIDDEN_LABELS.filter((l) => labels.includes(l))) {
    out.push(problem("labels", `${where}: forbidden label ${label}`, i));
  }
  const outside = labels.filter(
    (label) =>
      !policy.allowedLabels.includes(label) &&
      !FORBIDDEN_LABELS.includes(label),
  );
  if (outside.length) {
    out.push(
      problem(
        "labels",
        `${where}: ${plural(outside.length, "label")} outside the allowlist`,
        i,
      ),
    );
  }
  return out;
}

function commentRules(
  action: TriageAction,
  i: number,
  ctx: PlanContext,
): Problem[] {
  const where = at(i, action);
  const n = action.issue_number;
  if (n === undefined) {
    return [problem("comment", `${where}: no issue_number`, i)];
  }
  const out: Problem[] = [];
  if (isBlank(action.body)) {
    out.push(problem("body", `${where}: empty body`, i));
  }
  const target = ctx.issues.find((issue) => issue.number === n);
  if (!target) {
    out.push(
      problem("comment", `${where}: targets #${n}, which was not shown`, i),
    );
  } else if (
    !ctx.policy.trustedAuthors.includes(target.author) &&
    !target.labels.includes("feedback")
  ) {
    out.push(
      problem(
        "comment",
        `${where}: targets #${n}, not opened by a trusted author or labelled feedback`,
        i,
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
    .map(([n, count]) => problem("comment", `${count} comments on #${n}`));
}

function piiKinds(text: string): string[] {
  return [
    ...(EMAIL.test(text) ? ["email"] : []),
    ...(UUID.test(text) ? ["UUID"] : []),
    ...(PHONE.test(text) ? ["phone number"] : []),
  ];
}

/** PII and links: checked on every field that leaves the process, public or logged. */
function leakRules(
  where: string,
  field: string,
  text: string | undefined,
  action?: number,
): Problem[] {
  if (!text) return [];
  return [
    ...piiKinds(text).map((kind) =>
      problem("pii", `${where}: possible ${kind} in ${field}`, action),
    ),
    ...(LINKS.some((re) => re.test(text))
      ? [problem("link", `${where}: link in ${field}`, action)]
      : []),
  ];
}

/** Rules for the public text of an action: its title and body. */
function publicTextRules(
  action: TriageAction,
  i: number,
  ctx: PlanContext,
): Problem[] {
  const where = at(i, action);
  const out: Problem[] = [];
  const known = new Set(ctx.issues.map((issue) => issue.number));
  for (const field of ["title", "body"] as const) {
    const text = action[field];
    if (!text) continue;
    out.push(...leakRules(where, field, text, i));
    if (MENTION.test(text)) {
      out.push(problem("mention", `${where}: @-mention in ${field}`, i));
    }
    if (CROSS_REPO.test(text)) {
      out.push(
        problem("reference", `${where}: cross-repo reference in ${field}`, i),
      );
    }
    const unknown = [
      ...new Set([...text.matchAll(ISSUE_REF)].map((m) => Number(m[1]))),
    ].filter((n) => !known.has(n));
    if (unknown.length) {
      out.push(
        problem(
          "reference",
          `${where}: ${field} references ${unknown.map((n) => `#${n}`).join(",")}, not shown`,
          i,
        ),
      );
    }
  }
  return out;
}

/**
 * The invariant every adapter passes: a plan with any Problem is rejected
 * whole. Pure; the context says what the analyzer was shown and what the
 * policy allows.
 */
export function validatePlan(plan: TriagePlan, ctx: PlanContext): Problem[] {
  const each = (
    fn: (action: TriageAction, i: number) => Problem[],
  ): Problem[] => plan.actions.flatMap((action, i) => fn(action, i));
  return [
    ...coverage(plan, ctx),
    ...caps(plan, ctx.policy),
    ...each((a, i) =>
      a.type === "create_issue" ? createRules(a, i, ctx.policy) : [],
    ),
    ...each((a, i) =>
      a.type === "comment_issue" ? commentRules(a, i, ctx) : [],
    ),
    ...oneCommentPerIssue(plan),
    ...each((a, i) => (a.type === "skip" ? [] : publicTextRules(a, i, ctx))),
    ...each((a, i) => leakRules(at(i, a), "reason", a.reason, i)),
    ...leakRules("plan", "summary", plan.summary),
  ];
}

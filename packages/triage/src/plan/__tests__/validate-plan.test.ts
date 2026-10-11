import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  parsePlan,
  validatePlan,
  type TriageAction,
  type TriagePlan,
} from "../index";
import {
  COMMENT,
  CONTEXT,
  CREATE,
  SKIP,
  planWith,
  planWithBodyText,
  validPlan,
} from "./fixtures";

function messages(plan: TriagePlan, ctx = CONTEXT): string[] {
  return validatePlan(plan, ctx).map((p) => p.message);
}

function withActions(...actions: TriageAction[]): TriagePlan {
  return { ...validPlan(), actions };
}

const repeat = (n: number, action: TriageAction) =>
  Array.from({ length: n }, () => structuredClone(action));

describe("validatePlan", () => {
  it("accepts the valid fixture", () => {
    expect(validatePlan(validPlan(), CONTEXT)).toEqual([]);
  });

  describe.each<[string, () => TriagePlan, string]>([
    // Feedback id coverage.
    [
      "unaccounted feedback",
      () => withActions(CREATE, COMMENT),
      "1 feedback id of 3 in no action",
    ],
    [
      "unknown feedback id",
      () => planWith(2, { feedback_ids: ["f3", "f9"] }),
      "action 2 (skip): 1 unknown feedback id",
    ],
    // Labels.
    [
      "disallowed label",
      () => planWith(0, { labels: [...CREATE.labels!, "priority-high"] }),
      "action 0 (create_issue): 1 label outside the allowlist",
    ],
    [
      "ready-for-agent",
      () => planWith(0, { labels: [...CREATE.labels!, "ready-for-agent"] }),
      "action 0 (create_issue): forbidden label ready-for-agent",
    ],
    [
      "missing feedback label",
      () => planWith(0, { labels: ["needs-triage", "feature", "mcp-server"] }),
      "action 0 (create_issue): missing required labels",
    ],
    [
      "missing needs-triage label",
      () => planWith(0, { labels: ["feedback", "feature", "mcp-server"] }),
      "action 0 (create_issue): missing required labels",
    ],
    // Titles.
    [
      "non-conventional title",
      () => planWith(0, { title: "Add custom quantities" }),
      "action 0 (create_issue): title is not",
    ],
    [
      "newline in title",
      () => planWith(0, { title: "feat(mobile): something\nmore" }),
      "action 0 (create_issue): title is not",
    ],
    [
      "trailing newline in title",
      () => planWith(0, { title: "feat(mobile): trailing newline\n" }),
      "action 0 (create_issue): title is not",
    ],
    [
      "unknown scope",
      () => planWith(0, { title: "feat(billing): charge per household" }),
      "action 0 (create_issue): title is not",
    ],
    [
      "create without title",
      () => planWith(0, { title: undefined }),
      "action 0 (create_issue): title is not",
    ],
    // Bodies.
    [
      "empty body",
      () => planWith(0, { body: "" }),
      "action 0 (create_issue): empty body",
    ],
    [
      "blank body",
      () => planWith(0, { body: "  \n " }),
      "action 0 (create_issue): empty body",
    ],
    [
      "empty comment",
      () => planWith(1, { body: "" }),
      "action 1 (comment_issue): empty body",
    ],
    // PII.
    [
      "email",
      () => planWithBodyText("Contact jane.doe@example.com"),
      "action 0 (create_issue): possible email in body",
    ],
    [
      "uuid",
      () =>
        planWith(1, {
          body: `${COMMENT.body}\nuser 3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b`,
        }),
      "action 1 (comment_issue): possible UUID in body",
    ],
    [
      "phone",
      () => planWithBodyText("Call 555-867-5309"),
      "action 0 (create_issue): possible phone number in body",
    ],
    [
      "email in a title",
      () => planWith(0, { title: "fix(mobile): reply to jane@example.com" }),
      "action 0 (create_issue): possible email in title",
    ],
    [
      "PII in the summary",
      () => ({ ...validPlan(), summary: "Jane (555-867-5309) wrote in." }),
      "plan: possible phone number in summary",
    ],
    [
      "a link in the summary",
      () => ({ ...validPlan(), summary: "See evil.example/x for more." }),
      "plan: link in summary",
    ],
    [
      "PII in a reason",
      () => planWith(0, { reason: "From jane@example.com" }),
      "action 0 (create_issue): possible email in reason",
    ],
    [
      "PII in a skip's reason",
      () => planWith(2, { reason: "spam from jane@example.com" }),
      "action 2 (skip): possible email in reason",
    ],
    [
      "a link in a reason",
      () => planWith(1, { reason: "Like [this](//evil.example)" }),
      "action 1 (comment_issue): link in reason",
    ],
    // Caps.
    [
      "too many creates",
      () => withActions(...repeat(11, CREATE), COMMENT, SKIP),
      "too many issues: 11 > 10",
    ],
    [
      "too many actions",
      () =>
        withActions(
          ...repeat(9, CREATE),
          COMMENT,
          { ...COMMENT, issue_number: 30 },
          SKIP,
        ),
      "too many actions: 11 > 10",
    ],
    [
      "too many comments",
      () => withActions(...repeat(11, COMMENT), CREATE, SKIP),
      "too many comments: 11 > 10",
    ],
    [
      "two comments on one issue",
      () => withActions(CREATE, COMMENT, SKIP, COMMENT),
      "2 comments on #12",
    ],
    // Comment targets.
    [
      "comment without issue_number",
      () => planWith(1, { issue_number: undefined }),
      "action 1 (comment_issue): no issue_number",
    ],
    [
      "comment on an issue not in ctx",
      () => planWith(1, { issue_number: 99 }),
      "action 1 (comment_issue): targets #99, which was not shown",
    ],
    [
      "comment on an outsider's unlabelled issue",
      () => planWith(1, { issue_number: 20 }),
      "action 1 (comment_issue): targets #20, not opened by a trusted author or labelled feedback",
    ],
    // Mentions, cross-repo refs, links, unknown #N.
    [
      "@-mention",
      () => planWithBodyText("thanks @octocat"),
      "action 0 (create_issue): @-mention in body",
    ],
    [
      "team mention",
      () => planWithBodyText("cc @some-team"),
      "action 0 (create_issue): @-mention in body",
    ],
    [
      "@-mention in a comment",
      () => planWith(1, { body: `${COMMENT.body}\n@dtun please look` }),
      "action 1 (comment_issue): @-mention in body",
    ],
    [
      "cross-repo reference",
      () => planWithBodyText("see other/repo#4"),
      "action 0 (create_issue): cross-repo reference in body",
    ],
    [
      "https url",
      () => planWithBodyText("see https://evil.example/login"),
      "action 0 (create_issue): link in body",
    ],
    [
      "www url",
      () => planWithBodyText("visit www.evil.example"),
      "action 0 (create_issue): link in body",
    ],
    [
      "url in title",
      () => planWith(0, { title: "feat(mobile): see http://x.example" }),
      "action 0 (create_issue): link in title",
    ],
    [
      "unknown #N",
      () => planWithBodyText("Related to #77"),
      "action 0 (create_issue): body references #77, not shown",
    ],
  ])("rejects %s", (_name, plan, expected) => {
    it(`reports "${expected}"`, () => {
      expect(messages(plan())).toEqual(
        expect.arrayContaining([expect.stringContaining(expected)]),
      );
    });
  });

  it("tags problems with the offending action's index", () => {
    const [p] = validatePlan(planWithBodyText("thanks @octocat"), CONTEXT);
    expect(p).toMatchObject({ rule: "mention", action: 0 });
  });

  describe("never echoes plan text in problems", () => {
    const SECRETS = [
      "jane.doe@example.com",
      "555-867-5309",
      "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b",
      "Jane Doe",
      "priority-high",
      "f9-secret",
      "octocat",
    ];
    const leaky = (): TriagePlan => ({
      summary: "Jane Doe at jane.doe@example.com called 555-867-5309.",
      actions: [
        {
          ...CREATE,
          title: "Jane Doe 555-867-5309 wants jane.doe@example.com",
          body: "@octocat 3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b //evil.example",
          labels: ["priority-high"],
          feedback_ids: ["f1", "f9-secret"],
          reason: "Jane Doe asked",
        },
        { ...COMMENT, body: "jane.doe@example.com", reason: "555-867-5309" },
        { ...SKIP, reason: "Jane Doe, 3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b" },
      ],
    });

    it("finds the problems", () => {
      expect(messages(leaky()).length).toBeGreaterThan(8);
    });

    it.each(SECRETS)("does not contain %s", (secret) => {
      expect(messages(leaky()).join("\n")).not.toContain(secret);
    });

    it("keeps schema problems free of model-written keys and values", () => {
      const result = parsePlan({
        ...validPlan(),
        "jane.doe@example.com": "555-867-5309",
        actions: [{ ...CREATE, type: "Jane Doe" }],
      });
      expect(result.ok).toBe(false);
      const text = !result.ok
        ? result.problems.map((p) => p.message).join("\n")
        : "";
      for (const secret of ["jane.doe", "555-867-5309", "Jane Doe"]) {
        expect(text).not.toContain(secret);
      }
    });
  });

  it.each([
    ["an email is not an @-mention", planWithBodyText("jane.doe@example.com")],
  ])("%s", (_name, plan) => {
    expect(messages(plan).join("\n")).not.toContain("@-mention");
  });

  it("does not count skips or creates as comments", () => {
    const plan = withActions(
      ...repeat(9, CREATE),
      COMMENT,
      { ...COMMENT, issue_number: 30 },
      SKIP,
    );
    expect(messages(plan).join("\n")).not.toContain("too many issues");
  });

  it("allows comments on issues labelled feedback by anyone", () => {
    expect(messages(planWith(1, { issue_number: 30 }))).toEqual([]);
  });

  it("allows #N references to issues in ctx", () => {
    expect(
      messages(planWithBodyText("Follow-up to #5, related to #12")),
    ).toEqual([]);
  });

  it("never allows ready-for-agent, even if a policy lists it", () => {
    const ctx = {
      ...CONTEXT,
      policy: {
        ...CONTEXT.policy,
        allowedLabels: [...CONTEXT.policy.allowedLabels, "ready-for-agent"],
      },
    };
    const plan = planWith(0, {
      labels: [...CREATE.labels!, "ready-for-agent"],
    });
    expect(messages(plan, ctx).join("\n")).toContain(
      "forbidden label ready-for-agent",
    );
  });

  it("takes comment trust from the policy", () => {
    const ctx = {
      ...CONTEXT,
      policy: { ...CONTEXT.policy, trustedAuthors: ["outsider"] },
    };
    expect(messages(planWith(1, { issue_number: 20 }), ctx)).toEqual([]);
    expect(messages(validPlan(), ctx).join("\n")).toContain("targets #12");
  });

  it("takes caps from the policy", () => {
    const ctx = {
      ...CONTEXT,
      policy: { ...CONTEXT.policy, maxActions: 1, maxComments: 0 },
    };
    expect(messages(validPlan(), ctx)).toEqual(
      expect.arrayContaining([
        "too many actions: 2 > 1",
        "too many comments: 1 > 0",
      ]),
    );
  });

  describe("phone numbers", () => {
    it.each([
      "555 123 4567",
      "5551234567",
      "+1 555 123 4567",
      "(555) 123-4567",
      "555.123.4567",
      "+44 20 7946 0958",
    ])("flags %s", (phone) => {
      expect(messages(planWithBodyText(`call ${phone}`)).join("\n")).toContain(
        "possible phone number in body",
      );
    });

    it.each([
      "since 2025 and in 2026",
      "on 2026-10-10",
      "1000 liters for 12 people",
      "10 20 30 40 units",
      "household of 4, 3 gallons per day for 14 days",
      "about 250 000 calories",
    ])("does not flag %s", (text) => {
      expect(messages(planWithBodyText(text))).toEqual([]);
    });
  });

  it("ignores mentions and #N in reasons and the summary (they stay local)", () => {
    const plan = {
      ...planWith(1, { reason: "Open issue #12 covers it; cc @dtun" }),
      summary: "Commented on #12 and #999.",
    };
    expect(messages(plan)).toEqual([]);
  });
  it("ships a default policy matching #58", () => {
    expect(DEFAULT_POLICY.maxActions).toBe(10);
    expect(DEFAULT_POLICY.maxComments).toBe(10);
    expect(DEFAULT_POLICY.requiredLabels).toEqual(["feedback", "needs-triage"]);
    expect(DEFAULT_POLICY.allowedLabels).not.toContain("ready-for-agent");
  });
});

describe("parsePlan", () => {
  it("accepts the valid fixture", () => {
    expect(parsePlan(validPlan())).toEqual({ ok: true, plan: validPlan() });
  });

  it.each<[string, unknown]>([
    ["not an object", "plan"],
    ["missing actions", { summary: "x" }],
    ["unknown action type", planWith(0, { type: "close_issue" as never })],
    ["extra property", { ...validPlan(), extra: true }],
    ["extra action property", planWith(0, { assignee: "x" } as never)],
    ["empty feedback_ids", planWith(2, { feedback_ids: [] })],
    ["non-integer issue_number", planWith(1, { issue_number: 1.5 })],
  ])("rejects %s with problems", (_name, raw) => {
    const result = parsePlan(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.length).toBeGreaterThan(0);
      expect(result.problems[0].rule).toBe("schema");
    }
  });
});

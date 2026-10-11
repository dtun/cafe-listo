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
      "unaccounted feedback: f3",
    ],
    [
      "unknown feedback id",
      () => planWith(2, { feedback_ids: ["f3", "f9"] }),
      "unknown feedback ids: f9",
    ],
    // Labels.
    [
      "disallowed label",
      () => planWith(0, { labels: [...CREATE.labels!, "priority-high"] }),
      "disallowed labels priority-high on:",
    ],
    [
      "ready-for-agent",
      () => planWith(0, { labels: [...CREATE.labels!, "ready-for-agent"] }),
      "disallowed labels ready-for-agent on:",
    ],
    [
      "missing feedback label",
      () => planWith(0, { labels: ["needs-triage", "feature", "mcp-server"] }),
      "missing required labels:",
    ],
    [
      "missing needs-triage label",
      () => planWith(0, { labels: ["feedback", "feature", "mcp-server"] }),
      "missing required labels:",
    ],
    // Titles.
    [
      "non-conventional title",
      () => planWith(0, { title: "Add custom quantities" }),
      "bad title: Add custom quantities",
    ],
    [
      "newline in title",
      () => planWith(0, { title: "feat(mobile): something\nmore" }),
      "bad title:",
    ],
    [
      "trailing newline in title",
      () => planWith(0, { title: "feat(mobile): trailing newline\n" }),
      "bad title:",
    ],
    [
      "unknown scope",
      () => planWith(0, { title: "feat(billing): charge per household" }),
      "bad title:",
    ],
    [
      "create without title",
      () => planWith(0, { title: undefined }),
      "bad title:",
    ],
    // Bodies.
    ["empty body", () => planWith(0, { body: "" }), "empty body:"],
    ["blank body", () => planWith(0, { body: "  \n " }), "empty body:"],
    ["empty comment", () => planWith(1, { body: "" }), "empty comment on #12"],
    // PII.
    [
      "email",
      () => planWithBodyText("Contact jane.doe@example.com"),
      "possible personal info in: feat(mcp-server)",
    ],
    [
      "uuid",
      () =>
        planWith(1, {
          body: `${COMMENT.body}\nuser 3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b`,
        }),
      "possible personal info in: comment #12",
    ],
    [
      "phone",
      () => planWithBodyText("Call 555-867-5309"),
      "possible personal info in: feat(mcp-server)",
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
      "multiple comments on #12",
    ],
    // Comment targets.
    [
      "comment without issue_number",
      () => planWith(1, { issue_number: undefined }),
      "comment without issue_number",
    ],
    [
      "comment on an issue not in ctx",
      () => planWith(1, { issue_number: 99 }),
      "comment targets unknown issue #99",
    ],
    [
      "comment on an outsider's unlabelled issue",
      () => planWith(1, { issue_number: 20 }),
      "comment target #20 not opened by a trusted author or labelled feedback",
    ],
    // Mentions, cross-repo refs, URLs, unknown #N.
    ["@-mention", () => planWithBodyText("thanks @octocat"), "@-mention in:"],
    ["team mention", () => planWithBodyText("cc @some-team"), "@-mention in:"],
    [
      "@-mention in a comment",
      () => planWith(1, { body: `${COMMENT.body}\n@dtun please look` }),
      "@-mention in: comment #12",
    ],
    [
      "cross-repo reference",
      () => planWithBodyText("see other/repo#4"),
      "cross-repo reference in:",
    ],
    [
      "https url",
      () => planWithBodyText("see https://evil.example/login"),
      "link in:",
    ],
    ["www url", () => planWithBodyText("visit www.evil.example"), "link in:"],
    [
      "url in title",
      () => planWith(0, { title: "feat(mobile): see http://x.example" }),
      "link in:",
    ],
    [
      "unknown #N",
      () => planWithBodyText("Related to #77"),
      "unknown issue reference #77 in:",
    ],
  ])("rejects %s", (_name, plan, expected) => {
    it(`reports "${expected}"`, () => {
      expect(messages(plan())).toEqual(
        expect.arrayContaining([expect.stringContaining(expected)]),
      );
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
      "disallowed labels ready-for-agent",
    );
  });

  it("takes comment trust from the policy", () => {
    const ctx = {
      ...CONTEXT,
      policy: { ...CONTEXT.policy, trustedAuthors: ["outsider"] },
    };
    expect(messages(planWith(1, { issue_number: 20 }), ctx)).toEqual([]);
    expect(messages(validPlan(), ctx).join("\n")).toContain(
      "comment target #12",
    );
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
        "possible personal info in:",
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

  it("ignores text in skip actions", () => {
    const plan = planWith(2, { reason: "spam from jane@example.com" });
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

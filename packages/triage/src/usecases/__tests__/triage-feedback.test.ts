import { describe, expect, it } from "vitest";
import { EPOCH_CURSOR } from "../../cursor";
import {
  RAW_FEEDBACK,
  planWith,
  validPlan,
} from "../../plan/__tests__/fixtures";
import {
  FakePlanAnalyzer,
  skipEverything,
} from "../../__tests__/fakes/fake-plan-analyzer";
import { fixedClock } from "../../__tests__/fakes/fixed-clock";
import { InMemoryFeedbackReader } from "../../__tests__/fakes/in-memory-feedback-reader";
import { InMemoryIssueTracker } from "../../__tests__/fakes/in-memory-issue-tracker";
import { InMemoryTriageLedger } from "../../__tests__/fakes/in-memory-triage-ledger";
import {
  POLICY,
  TRACKER_ISSUES,
  fourActionPlan as fourActionPlanFixture,
  world,
} from "../../__tests__/fakes/world";
import { DEFAULT_LIMITS, TriageFeedback } from "../triage-feedback";

const BATCH_MAX = { createdAt: "2026-10-03T10:00:00.000000Z", id: "f3" };

describe("TriageFeedback", () => {
  describe("happy path", () => {
    it("files the plan, then clears pending and advances the cursor", async () => {
      const w = world();
      const result = await w.triage.execute();

      expect(result.ok).toBe(true);
      expect(w.tracker.created.map((i) => i.title)).toEqual([
        "feat(mcp-server): support custom quantities per household member",
        "fix(mobile): checked items reset after reconnect",
      ]);
      expect(w.tracker.comments.map((c) => c.issueNumber)).toEqual([12]);
      expect(w.ledger.pending).toBeNull();
      expect(w.ledger.cursor).toEqual(BATCH_MAX);
    });

    it("labels issues as planned and appends a provenance footer", async () => {
      const w = world();
      await w.triage.execute();

      const [issue] = w.tracker.created;
      expect(issue.labels).toEqual([
        "feedback",
        "needs-triage",
        "feature",
        "mcp-server",
      ]);
      expect(issue.body).toMatch(/^## Problem/);
      expect(issue.body).toMatch(/\n---\n.*feedback records: f1/);
      expect(w.tracker.comments[0].body).toMatch(/feedback records: f2/);
    });

    it("reports counts, indexes, types and urls of what it filed", async () => {
      const w = world();
      const result = await w.triage.execute();
      if (!result.ok) throw new Error(result.error.message);

      expect(result.data).toMatchObject({
        dryRun: false,
        status: "triaged",
        feedbackCount: 3,
        cursor: { from: EPOCH_CURSOR, to: BATCH_MAX },
        resumed: null,
      });
      expect(result.data.actions).toEqual([
        {
          index: 0,
          type: "create_issue",
          feedbackCount: 1,
          url: "https://github.com/dtun/cafe-listo/issues/101",
        },
        {
          index: 1,
          type: "comment_issue",
          issueNumber: 12,
          feedbackCount: 1,
          url: "https://github.com/dtun/cafe-listo/issues/12#issuecomment-1",
        },
        {
          index: 3,
          type: "create_issue",
          feedbackCount: 1,
          url: "https://github.com/dtun/cafe-listo/issues/102",
        },
      ]);
      expect(result.data.skips).toEqual([{ index: 2, feedbackCount: 1 }]);
    });

    it("keeps plan and feedback text out of the report", async () => {
      const w = world();
      const result = await w.triage.execute();
      const json = JSON.stringify(result);
      for (const text of [
        validPlan().summary,
        "support custom quantities",
        "Smoke test.",
        "New need not covered",
        "f1",
        "bbbbbbbb",
      ]) {
        expect(json).not.toContain(text);
      }
    });

    it("keeps plan text out of an action failure", async () => {
      const w = world();
      w.tracker.failWriteAt = 1;
      const result = await w.triage.execute();
      expect(result).toMatchObject({
        ok: false,
        error: { code: "action_failed" },
      });
      if (!result.ok) {
        expect(result.error.message).toMatch(
          /^action 0 \(create_issue\) failed/,
        );
        expect(result.error.message).not.toContain("custom quantities");
      }
    });

    it("shows the analyzer aliased feedback, open and recent closed issues", async () => {
      const w = world();
      await w.triage.execute();

      const [input] = w.analyzer.inputs;
      expect(JSON.stringify(input)).not.toMatch(/userId|aaaaaaaa|bbbbbbbb/);
      expect(input.feedback.map((f) => f.reporter)).toEqual(["r2", "r1", "r2"]);
      expect(input.issues.map((i) => i.number).sort((a, b) => a - b)).toEqual([
        5, 12, 20, 30,
      ]);
      expect(input.trustedAuthors).toEqual(["dtun"]);
      expect(w.tracker.closedSinceCalls).toEqual([
        new Date("2026-07-12T08:07:00.000Z"),
      ]);
    });

    it("reads from the stored cursor", async () => {
      const w = world();
      w.ledger.cursor = { createdAt: "2026-10-01T10:00:00.000000Z", id: "f1" };
      const result = await w.triage.execute();

      expect(w.reader.calls[0].cursor).toEqual({
        createdAt: "2026-10-01T10:00:00.000000Z",
        id: "f1",
      });
      // f1 is behind the cursor, so the plan that covers it is now invalid.
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_plan" },
      });
    });

    it("does nothing when no feedback is new", async () => {
      const w = world();
      w.ledger.cursor = BATCH_MAX;
      const result = await w.triage.execute();

      expect(result).toMatchObject({
        ok: true,
        data: { status: "nothing_new", feedbackCount: 0 },
      });
      expect(w.analyzer.inputs).toHaveLength(0);
      expect(w.ledger.writes).toBe(0);
    });
  });

  describe("resume after a mid-run failure", () => {
    it("files nothing twice and never re-asks the model", async () => {
      const w = world();
      w.tracker.failWriteAt = 3; // the second create

      const first = await w.triage.execute();
      expect(first).toMatchObject({
        ok: false,
        error: { code: "action_failed" },
      });
      if (!first.ok) expect(first.error.message).toMatch(/next run resumes/);
      expect(w.tracker.writeCount).toBe(2);
      expect(w.ledger.pending?.done.map((d) => d.index)).toEqual([0, 1, 2]);
      expect(w.ledger.cursor).toBeNull();

      w.tracker.failWriteAt = null;
      const second = await w.triage.execute();

      expect(second.ok).toBe(true);
      expect(w.analyzer.inputs).toHaveLength(1);
      expect(w.tracker.created.map((i) => i.title)).toEqual([
        "feat(mcp-server): support custom quantities per household member",
        "fix(mobile): checked items reset after reconnect",
      ]);
      expect(w.tracker.comments).toHaveLength(1);
      expect(w.ledger.pending).toBeNull();
      expect(w.ledger.cursor).toEqual(BATCH_MAX);
      if (second.ok) {
        expect(second.data.resumed?.map((a) => [a.index, a.url])).toEqual([
          [3, "https://github.com/dtun/cafe-listo/issues/102"],
        ]);
        // The fresh run after the resume found nothing past the new cursor.
        expect(second.data.status).toBe("nothing_new");
      }
    });

    it("refuses a pending plan that no longer validates", async () => {
      const w = world();
      w.tracker.failWriteAt = 1;
      await w.triage.execute();
      w.ledger.pending!.plan.actions[0].labels!.push("ready-for-agent");
      w.tracker.failWriteAt = null;

      const result = await w.triage.execute();

      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_pending" },
      });
      expect(w.tracker.writeCount).toBe(0);
    });
  });

  describe("crash between filing and recording", () => {
    it("finds the filed issue by its marker instead of filing it again", async () => {
      const w = world();
      w.ledger.failMarkAt = 1; // the first create landed, then the record failed

      const first = await w.triage.execute();
      expect(first).toMatchObject({
        ok: false,
        error: { code: "dependency_failed" },
      });
      expect(w.tracker.created).toHaveLength(1);
      expect(w.ledger.pending?.done).toEqual([]);

      const second = await w.triage.execute();

      expect(second.ok).toBe(true);
      expect(w.tracker.created.map((i) => i.title)).toEqual([
        "feat(mcp-server): support custom quantities per household member",
        "fix(mobile): checked items reset after reconnect",
      ]);
      expect(w.analyzer.inputs).toHaveLength(1);
      if (second.ok) {
        expect(second.data.resumed?.[0]).toMatchObject({
          index: 0,
          url: "https://github.com/dtun/cafe-listo/issues/101",
        });
      }
    });

    it("finds the posted comment by its marker instead of posting it again", async () => {
      const w = world();
      w.ledger.failMarkAt = 2; // the comment landed, then the record failed

      await w.triage.execute();
      expect(w.tracker.comments).toHaveLength(1);

      expect((await w.triage.execute()).ok).toBe(true);
      expect(w.tracker.comments).toHaveLength(1);
      expect(w.tracker.created).toHaveLength(2);
    });

    it("hides a per-action provenance marker in every body", async () => {
      const w = world();
      await w.triage.execute();

      expect(w.tracker.created[0].body).toMatch(/\n<!-- triage:plan-1:0 -->$/);
      expect(w.tracker.comments[0].body).toMatch(/\n<!-- triage:plan-1:1 -->$/);
      expect(w.tracker.created[1].body).toMatch(/\n<!-- triage:plan-1:3 -->$/);
    });

    it("saves the plan id with the pending plan", async () => {
      const w = world();
      w.tracker.failWriteAt = 1;
      await w.triage.execute();
      expect(w.ledger.pending?.planId).toBe("plan-1");
    });
  });

  describe("run lock", () => {
    it("refuses to run while another run holds the lock", async () => {
      const w = world();
      w.ledger.heldElsewhere = true;

      const result = await w.triage.execute();

      expect(result).toMatchObject({ ok: false, error: { code: "locked" } });
      expect(w.reader.calls).toHaveLength(0);
      expect(w.analyzer.inputs).toHaveLength(0);
      expect(w.tracker.writeCount).toBe(0);
    });

    it("releases the lock after success and after failure", async () => {
      const ok = world();
      await ok.triage.execute();
      expect(ok.ledger.locked).toBe(false);

      const failed = world();
      failed.tracker.failWriteAt = 1;
      await failed.triage.execute();
      expect(failed.ledger.locked).toBe(false);

      const thrown = world();
      thrown.reader.failWith = new Error("boom");
      await thrown.triage.execute();
      expect(thrown.ledger.locked).toBe(false);
    });

    it("holds the lock while it works", async () => {
      const w = world();
      let lockedDuringAnalysis = false;
      w.analyzer.output = (input: never) => {
        lockedDuringAnalysis = w.ledger.locked;
        void input;
        return fourActionPlanFixture();
      };
      await w.triage.execute();
      expect(lockedDuringAnalysis).toBe(true);
    });

    it("takes no lock on a dry run", async () => {
      const w = world();
      w.ledger.heldElsewhere = true;
      const result = await w.triage.execute({ dryRun: true });
      expect(result.ok).toBe(true);
    });
  });

  describe("incomplete issue list", () => {
    it("fails before the model is asked", async () => {
      const w = world();
      w.tracker.openCountOverride = 5;

      const result = await w.triage.execute();

      expect(result).toMatchObject({
        ok: false,
        error: { code: "incomplete_issues" },
      });
      if (!result.ok) expect(result.error.message).toContain("3 of 5");
      expect(w.analyzer.inputs).toHaveLength(0);
      expect(w.ledger.writes).toBe(0);
    });

    it("fails when listing issues fails", async () => {
      const w = world();
      w.tracker.failListWith = new Error("gh: HTTP 401");

      const result = await w.triage.execute();

      expect(result).toMatchObject({
        ok: false,
        error: { code: "dependency_failed" },
      });
      expect(w.analyzer.inputs).toHaveLength(0);
    });
  });

  describe("invalid plan", () => {
    it.each<[string, unknown]>([
      ["fails validation", planWith(0, { labels: ["feedback"] })],
      ["fails the schema", { summary: "x", actions: "all of them" }],
      ["is not JSON-shaped", "I filed everything myself"],
    ])(
      "files nothing and keeps the cursor when the output %s",
      async (_n, raw) => {
        const w = world(raw);
        w.ledger.cursor = null;

        const result = await w.triage.execute();

        expect(result).toMatchObject({
          ok: false,
          error: { code: "invalid_plan" },
        });
        if (!result.ok)
          expect(result.error.problems?.length).toBeGreaterThan(0);
        expect(w.tracker.writeCount).toBe(0);
        expect(w.ledger.writes).toBe(0);
        expect(w.ledger.cursor).toBeNull();
      },
    );
  });

  describe("dry run", () => {
    it("analyzes and reports, but writes nothing", async () => {
      const w = world();

      const result = await w.triage.execute({ dryRun: true });

      expect(result).toMatchObject({
        ok: true,
        data: { dryRun: true, status: "triaged", feedbackCount: 3 },
      });
      if (result.ok) {
        expect(result.data.actions.every((a) => a.url === null)).toBe(true);
        expect(result.data.actions).toHaveLength(3);
      }
      expect(w.analyzer.inputs).toHaveLength(1);
      expect(w.tracker.writeCount).toBe(0);
      expect(w.ledger.writes).toBe(0);
    });

    it("still rejects an invalid plan", async () => {
      const w = world(planWith(0, { title: "Add things" }));
      const result = await w.triage.execute({ dryRun: true });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_plan" },
      });
    });

    it("reports a pending plan instead of resuming or re-analyzing it", async () => {
      const w = world();
      w.tracker.failWriteAt = 3;
      await w.triage.execute();
      w.tracker.failWriteAt = null;
      const writes = w.ledger.writes;

      const result = await w.triage.execute({ dryRun: true });

      expect(result).toMatchObject({
        ok: true,
        data: { status: "pending_plan", pending: { done: 3, total: 4 } },
      });
      expect(w.tracker.writeCount).toBe(2);
      expect(w.analyzer.inputs).toHaveLength(1);
      expect(w.ledger.writes).toBe(writes);
    });
  });

  describe("cursor", () => {
    it("advances only once every action succeeded", async () => {
      for (const failAt of [1, 2, 3]) {
        const w = world();
        w.tracker.failWriteAt = failAt;
        await w.triage.execute();
        expect(w.ledger.cursor).toBeNull();
      }
      const w = world();
      await w.triage.execute();
      expect(w.ledger.cursor).toEqual(BATCH_MAX);
    });

    it("never skips rows that share a timestamp across a batch cut", async () => {
      const at = "2026-10-05T10:00:00.000000Z";
      const rows = ["a", "b", "c", "d", "e"].map((id, i) => ({
        ...RAW_FEEDBACK[0],
        id,
        createdAt: i === 0 ? "2026-10-04T10:00:00.000000Z" : at,
      }));
      const reader = new InMemoryFeedbackReader(rows);
      const analyzer = new FakePlanAnalyzer(skipEverything);
      const ledger = new InMemoryTriageLedger();
      const triage = new TriageFeedback({
        reader,
        tracker: new InMemoryIssueTracker(structuredClone(TRACKER_ISSUES)),
        analyzer,
        ledger,
        clock: fixedClock(),
        policy: POLICY,
        limits: { ...DEFAULT_LIMITS, feedback: 2 },
      });

      for (let run = 0; run < 4; run++) await triage.execute();

      expect(analyzer.inputs.map((i) => i.feedback.map((f) => f.id))).toEqual([
        ["a", "b"],
        ["c", "d"],
        ["e"],
      ]);
      expect(ledger.cursor).toEqual({ createdAt: at, id: "e" });
    });

    it("stays put when reading feedback fails", async () => {
      const w = world();
      w.reader.failWith = new Error("supabase: timed out");
      const result = await w.triage.execute();
      expect(result).toMatchObject({
        ok: false,
        error: { code: "dependency_failed" },
      });
      expect(w.ledger.writes).toBe(0);
    });
  });
});

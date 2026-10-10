import { describe, expect, it } from "vitest";
import { EPOCH_CURSOR } from "../../cursor";
import { planWith, validPlan } from "../../plan/__tests__/fixtures";
import { world } from "../../__tests__/fakes/world";

const BATCH_MAX = "2026-10-03T10:00:00.000000Z";

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
      expect(w.ledger.cursor).toBe(BATCH_MAX);
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

    it("reports the summary, each action's url and the skips", async () => {
      const w = world();
      const result = await w.triage.execute();
      if (!result.ok) throw new Error(result.error.message);

      expect(result.data).toMatchObject({
        dryRun: false,
        status: "triaged",
        feedbackCount: 3,
        summary: validPlan().summary,
        cursor: { from: EPOCH_CURSOR, to: BATCH_MAX },
        resumed: null,
      });
      expect(result.data.actions.map((a) => [a.target, a.url])).toEqual([
        [
          "feat(mcp-server): support custom quantities per household member",
          "https://github.com/dtun/cafe-listo/issues/101",
        ],
        ["#12", "https://github.com/dtun/cafe-listo/issues/12#issuecomment-1"],
        [
          "fix(mobile): checked items reset after reconnect",
          "https://github.com/dtun/cafe-listo/issues/102",
        ],
      ]);
      expect(result.data.skips).toEqual([
        { index: 2, feedbackIds: ["f3"], reason: "Smoke test." },
      ]);
    });

    it("shows the analyzer aliased feedback, open and recent closed issues", async () => {
      const w = world();
      await w.triage.execute();

      const [input] = w.analyzer.inputs;
      expect(JSON.stringify(input)).not.toMatch(/userId|aaaaaaaa|bbbbbbbb/);
      expect(input.feedback.map((f) => f.reporter)).toEqual(["r2", "r1", "r2"]);
      expect(input.issues.map((i) => i.number).sort()).toEqual([5, 12, 20, 30]);
      expect(input.trustedAuthors).toEqual(["dtun"]);
      expect(w.tracker.closedSinceCalls).toEqual([
        new Date("2026-07-12T08:07:00.000Z"),
      ]);
    });

    it("reads from the stored cursor", async () => {
      const w = world();
      w.ledger.cursor = "2026-10-01T10:00:00.000000Z";
      const result = await w.triage.execute();

      expect(w.reader.calls[0].cursor).toBe("2026-10-01T10:00:00.000000Z");
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
      expect(w.ledger.cursor).toBe(BATCH_MAX);
      if (second.ok) {
        expect(second.data.resumed?.map((a) => a.target)).toEqual([
          "fix(mobile): checked items reset after reconnect",
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
      expect(w.ledger.cursor).toBe(BATCH_MAX);
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

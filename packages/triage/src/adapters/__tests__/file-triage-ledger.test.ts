import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { validPlan } from "../../plan/__tests__/fixtures";
import type { PendingPlan } from "../../ports";
import { FileTriageLedger } from "../file-triage-ledger";

const PENDING: PendingPlan = {
  plan: validPlan(),
  context: {
    feedbackIds: ["f1", "f2", "f3"],
    issues: [{ number: 12, state: "OPEN", author: "dtun", labels: [] }],
  },
  advanceTo: { createdAt: "2026-10-03T10:00:00.000000Z", id: "f3" },
  done: [],
};

let dir: string;
let ledger: FileTriageLedger;

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "triage-ledger-")), "state");
  ledger = new FileTriageLedger(dir);
});

describe("FileTriageLedger", () => {
  it("starts empty, without creating anything", async () => {
    expect(await ledger.getCursor()).toBeNull();
    expect(await ledger.getPendingPlan()).toBeNull();
  });

  it("round-trips a pending plan and its finished actions", async () => {
    await ledger.savePendingPlan(PENDING);
    await ledger.markActionDone(
      0,
      "https://github.com/dtun/cafe-listo/issues/1",
    );
    await ledger.markActionDone(2, null);

    expect(await ledger.getPendingPlan()).toEqual({
      ...PENDING,
      done: [
        { index: 0, url: "https://github.com/dtun/cafe-listo/issues/1" },
        { index: 2, url: null },
      ],
    });
  });

  it("clears pending and stores the cursor", async () => {
    await ledger.savePendingPlan(PENDING);
    await ledger.clearPending(PENDING.advanceTo);

    expect(await ledger.getPendingPlan()).toBeNull();
    expect(await ledger.getCursor()).toEqual(PENDING.advanceTo);
    expect(readdirSync(dir).sort()).toEqual(["cursor"]);
  });

  it("leaves no temp files behind", async () => {
    await ledger.savePendingPlan(PENDING);
    await ledger.markActionDone(0, null);
    expect(readdirSync(dir)).toEqual(["pending.json"]);
  });

  it("refuses a tampered cursor file", async () => {
    await ledger.clearPending(PENDING.advanceTo);
    writeFileSync(
      join(dir, "cursor"),
      JSON.stringify({ createdAt: "1970-01-01' or '1'='1", id: "f3" }),
    );
    await expect(ledger.getCursor()).rejects.toThrow(/does not hold a cursor/);
  });

  it("refuses to store a malformed cursor", async () => {
    await expect(
      ledger.clearPending({ createdAt: "yesterday", id: "f3" }),
    ).rejects.toThrow(/malformed/);
  });

  it("refuses a malformed pending plan", async () => {
    await ledger.savePendingPlan(PENDING);
    const file = join(dir, "pending.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    json.plan.actions[0].type = "close_issue";
    writeFileSync(file, JSON.stringify(json));
    await expect(ledger.getPendingPlan()).rejects.toThrow(/malformed/);
  });

  it("refuses to mark an action without a pending plan", async () => {
    await expect(ledger.markActionDone(0, null)).rejects.toThrow(/no pending/);
  });
});

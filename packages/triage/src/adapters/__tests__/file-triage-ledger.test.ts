import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { validPlan } from "../../plan/__tests__/fixtures";
import type { PendingPlan } from "../../ports";
import { FileTriageLedger } from "../file-triage-ledger";

const PENDING: PendingPlan = {
  planId: "11111111-2222-4333-8444-555555555555",
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

describe("FileTriageLedger lock", () => {
  const alive = new Set<number>();
  const ledgerFor = (pid: number) =>
    new FileTriageLedger(dir, { pid, isAlive: (p) => alive.has(p) });

  beforeEach(() => {
    alive.clear();
  });

  it("is exclusive while its owner is running", async () => {
    alive.add(100);
    const first = ledgerFor(100);
    const second = ledgerFor(200);

    expect(await first.acquireLock()).toBe(true);
    expect(readFileSync(join(dir, "lock"), "utf8")).toBe("100\n");
    expect(await second.acquireLock()).toBe(false);

    await first.releaseLock();
    expect(existsSync(join(dir, "lock"))).toBe(false);
    expect(await second.acquireLock()).toBe(true);
  });

  it("takes over a stale lock whose owner is gone", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "lock"), "4242\n");
    const ledger = ledgerFor(100);

    expect(await ledger.acquireLock()).toBe(true);
    expect(readFileSync(join(dir, "lock"), "utf8")).toBe("100\n");
  });

  it("takes over an unreadable lock", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "lock"), "garbage");
    expect(await ledgerFor(100).acquireLock()).toBe(true);
  });

  it("never removes a lock it doesn't hold", async () => {
    alive.add(100);
    await ledgerFor(100).acquireLock();
    await ledgerFor(200).releaseLock();
    expect(readFileSync(join(dir, "lock"), "utf8")).toBe("100\n");
  });

  it("uses the real process table by default", async () => {
    const real = new FileTriageLedger(dir);
    expect(await real.acquireLock()).toBe(true);
    expect(await new FileTriageLedger(dir).acquireLock()).toBe(false);
    await real.releaseLock();
  });
});

import type { Cursor } from "../../cursor";
import type { PendingPlan, TriageLedger } from "../../ports";

export class InMemoryTriageLedger implements TriageLedger {
  /** Counts every state write (not the lock), so tests can assert a dry run wrote nothing. */
  writes = 0;
  locked = false;
  /** Simulates a live run elsewhere holding the lock. */
  heldElsewhere = false;
  /** Fail the Nth markActionDone (1-based), as a crash right after filing would. */
  failMarkAt: number | null = null;
  private marks = 0;

  constructor(
    public cursor: Cursor | null = null,
    public pending: PendingPlan | null = null,
  ) {}

  async acquireLock(): Promise<boolean> {
    if (this.locked || this.heldElsewhere) return false;
    this.locked = true;
    return true;
  }

  async releaseLock(): Promise<void> {
    this.locked = false;
  }

  async getCursor(): Promise<Cursor | null> {
    return this.cursor;
  }

  async getPendingPlan(): Promise<PendingPlan | null> {
    return this.pending ? structuredClone(this.pending) : null;
  }

  async savePendingPlan(pending: PendingPlan): Promise<void> {
    this.writes += 1;
    this.pending = structuredClone(pending);
  }

  async markActionDone(index: number, url: string | null): Promise<void> {
    this.marks += 1;
    if (this.marks === this.failMarkAt) throw new Error("disk full");
    this.writes += 1;
    if (!this.pending) throw new Error("no pending plan");
    this.pending.done.push({ index, url });
  }

  async clearPending(advanceTo: Cursor): Promise<void> {
    this.writes += 1;
    this.pending = null;
    this.cursor = advanceTo;
  }
}

import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  CREATED_AT_PATTERN,
  CURSOR_ID_PATTERN,
  isCursor,
  type Cursor,
} from "../cursor";
import { TriagePlanSchema } from "../plan";
import type { PendingPlan, TriageLedger } from "../ports";

const PendingPlanSchema = z.strictObject({
  planId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  plan: TriagePlanSchema,
  context: z.strictObject({
    feedbackIds: z.array(z.string()),
    issues: z.array(
      z.strictObject({
        number: z.int(),
        state: z.enum(["OPEN", "CLOSED"]),
        author: z.string(),
        labels: z.array(z.string()),
      }),
    ),
  }),
  advanceTo: z.strictObject({
    createdAt: z.string().regex(CREATED_AT_PATTERN),
    id: z.string().regex(CURSOR_ID_PATTERN),
  }),
  done: z.array(
    z.strictObject({ index: z.int().min(0), url: z.string().nullable() }),
  ),
});

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

/** Signal 0 probes without signalling; EPERM still means the process exists. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

export interface FileTriageLedgerOptions {
  pid?: number;
  isAlive?: (pid: number) => boolean;
}

/**
 * Ledger in a state dir: `cursor` (one JSON line), `pending.json` and `lock`.
 * Every write goes to a temp file first and is renamed into place, so a crash
 * never leaves a half-written file. The lock is an O_EXCL file holding the
 * owner's pid; a lock whose pid is no longer running is stale and taken over.
 */
export class FileTriageLedger implements TriageLedger {
  private readonly cursorFile: string;
  private readonly pendingFile: string;
  private readonly lockFile: string;
  private readonly pid: number;
  private readonly isAlive: (pid: number) => boolean;
  private holdsLock = false;

  constructor(
    private readonly stateDir: string,
    options: FileTriageLedgerOptions = {},
  ) {
    this.cursorFile = join(stateDir, "cursor");
    this.pendingFile = join(stateDir, "pending.json");
    this.lockFile = join(stateDir, "lock");
    this.pid = options.pid ?? process.pid;
    this.isAlive = options.isAlive ?? processAlive;
  }

  async acquireLock(): Promise<boolean> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockFile, "wx", 0o600);
        try {
          await handle.writeFile(`${this.pid}\n`);
        } finally {
          await handle.close();
        }
        this.holdsLock = true;
        return true;
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
        const owner = Number((await this.read(this.lockFile))?.trim());
        if (Number.isInteger(owner) && owner > 0 && this.isAlive(owner)) {
          return false;
        }
        // Stale (owner gone, or unreadable): remove it and try once more.
        await rm(this.lockFile, { force: true });
      }
    }
    return false;
  }

  async releaseLock(): Promise<void> {
    if (!this.holdsLock) return;
    this.holdsLock = false;
    const owner = Number((await this.read(this.lockFile))?.trim());
    if (owner === this.pid) await rm(this.lockFile, { force: true });
  }

  async getCursor(): Promise<Cursor | null> {
    const text = await this.read(this.cursorFile);
    if (text === null) return null;
    let cursor: unknown;
    try {
      cursor = JSON.parse(text);
    } catch {
      cursor = null;
    }
    if (!isCursor(cursor)) {
      throw new Error(`${this.cursorFile} does not hold a cursor`);
    }
    return cursor;
  }

  async getPendingPlan(): Promise<PendingPlan | null> {
    const text = await this.read(this.pendingFile);
    if (text === null) return null;
    const parsed = PendingPlanSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(
        `${this.pendingFile} is malformed; inspect it, then remove it`,
      );
    }
    return parsed.data;
  }

  async savePendingPlan(pending: PendingPlan): Promise<void> {
    await this.write(this.pendingFile, JSON.stringify(pending, null, 2));
  }

  async markActionDone(index: number, url: string | null): Promise<void> {
    const pending = await this.getPendingPlan();
    if (!pending) throw new Error("no pending plan to mark");
    pending.done.push({ index, url });
    await this.savePendingPlan(pending);
  }

  /** Cursor first: a crash in between leaves a fully-done plan that resumes as a no-op. */
  async clearPending(advanceTo: Cursor): Promise<void> {
    if (!isCursor(advanceTo)) {
      throw new Error("refusing to store a malformed cursor");
    }
    const { createdAt, id } = advanceTo;
    await this.write(this.cursorFile, `${JSON.stringify({ createdAt, id })}\n`);
    await rm(this.pendingFile, { force: true });
  }

  private async read(file: string): Promise<string | null> {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

  private async write(file: string, content: string): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, file);
  }
}

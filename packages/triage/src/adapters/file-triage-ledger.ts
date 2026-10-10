import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CURSOR_PATTERN, isCursor, type Cursor } from "../cursor";
import { TriagePlanSchema } from "../plan";
import type { PendingPlan, TriageLedger } from "../ports";

const PendingPlanSchema = z.strictObject({
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
  advanceTo: z.string().regex(CURSOR_PATTERN),
  done: z.array(
    z.strictObject({ index: z.int().min(0), url: z.string().nullable() }),
  ),
});

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Ledger in a state dir: `cursor` (one line) and `pending.json`. Every write
 * goes to a temp file first and is renamed into place, so a crash never
 * leaves a half-written file.
 */
export class FileTriageLedger implements TriageLedger {
  private readonly cursorFile: string;
  private readonly pendingFile: string;

  constructor(private readonly stateDir: string) {
    this.cursorFile = join(stateDir, "cursor");
    this.pendingFile = join(stateDir, "pending.json");
  }

  async getCursor(): Promise<Cursor | null> {
    const text = await this.read(this.cursorFile);
    if (text === null) return null;
    const cursor = text.trim();
    if (!isCursor(cursor)) {
      throw new Error(`${this.cursorFile} does not hold a cursor: ${cursor}`);
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
      throw new Error(`refusing to store a malformed cursor: ${advanceTo}`);
    }
    await this.write(this.cursorFile, `${advanceTo}\n`);
    await rm(this.pendingFile, { force: true });
  }

  private async read(file: string): Promise<string | null> {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
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

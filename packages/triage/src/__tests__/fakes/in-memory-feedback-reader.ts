import type { Cursor } from "../../cursor";
import type { FeedbackRecord } from "../../plan";
import type { FeedbackReader } from "../../ports";

export class InMemoryFeedbackReader implements FeedbackReader {
  readonly calls: { cursor: Cursor; limit: number }[] = [];
  failWith: Error | null = null;

  constructor(public rows: FeedbackRecord[] = []) {}

  async listSince(cursor: Cursor, limit: number): Promise<FeedbackRecord[]> {
    this.calls.push({ cursor, limit });
    if (this.failWith) throw this.failWith;
    return this.rows
      .filter((row) => row.createdAt > cursor)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }
}

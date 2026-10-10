import type { Issue, IssueTracker, NewIssue } from "../../ports";

export interface FiledIssue extends NewIssue {
  number: number;
  url: string;
}

export interface FiledComment {
  issueNumber: number;
  body: string;
  url: string;
}

/** A tracker that records writes. Failure switches simulate GitHub hiccups. */
export class InMemoryIssueTracker implements IssueTracker {
  readonly created: FiledIssue[] = [];
  readonly comments: FiledComment[] = [];
  readonly closedSinceCalls: Date[] = [];
  /** Fail the Nth write (1-based, creates and comments together). */
  failWriteAt: number | null = null;
  /** Report this many open issues regardless of the list. */
  openCountOverride: number | null = null;
  failListWith: Error | null = null;
  private writes = 0;
  private nextNumber = 100;

  constructor(public issues: Issue[] = []) {}

  async listOpen(limit: number): Promise<Issue[]> {
    if (this.failListWith) throw this.failListWith;
    return this.issues.filter((i) => i.state === "OPEN").slice(0, limit);
  }

  async listClosedSince(since: Date, limit: number): Promise<Issue[]> {
    this.closedSinceCalls.push(since);
    return this.issues.filter((i) => i.state === "CLOSED").slice(0, limit);
  }

  async openCount(): Promise<number> {
    return (
      this.openCountOverride ??
      this.issues.filter((i) => i.state === "OPEN").length
    );
  }

  async create(issue: NewIssue): Promise<string> {
    this.countWrite();
    const number = ++this.nextNumber;
    const url = `https://github.com/dtun/cafe-listo/issues/${number}`;
    this.created.push({ ...issue, number, url });
    return url;
  }

  async comment(issueNumber: number, body: string): Promise<string> {
    this.countWrite();
    const url = `https://github.com/dtun/cafe-listo/issues/${issueNumber}#issuecomment-${this.comments.length + 1}`;
    this.comments.push({ issueNumber, body, url });
    return url;
  }

  get writeCount(): number {
    return this.created.length + this.comments.length;
  }

  private countWrite(): void {
    this.writes += 1;
    if (this.writes === this.failWriteAt) {
      throw new Error("HTTP 502: GitHub is having a moment");
    }
  }
}

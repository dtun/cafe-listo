import { z } from "zod";
import type { Issue, IssueTracker, NewIssue } from "../ports";
import { ExecError, stderrTail, type Exec } from "./exec";

const FIELDS = "number,state,title,labels,body,author";
const BODY_EXCERPT = 400;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ISSUE_URL = /^https:\/\/github\.com\/\S+$/;

const GhIssueSchema = z.object({
  number: z.int(),
  state: z.enum(["OPEN", "CLOSED"]),
  title: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  body: z.string().nullable().optional(),
  /** null for deleted ("ghost") accounts. */
  author: z.object({ login: z.string() }).nullable(),
});

function toIssue(raw: z.infer<typeof GhIssueSchema>): Issue {
  return {
    number: raw.number,
    state: raw.state,
    title: raw.title,
    author: raw.author?.login ?? "",
    labels: raw.labels.map((label) => label.name),
    body: (raw.body ?? "").slice(0, BODY_EXCERPT),
  };
}

function lastLine(stdout: string): string {
  return stdout.trim().split("\n").pop()?.trim() ?? "";
}

/**
 * GitHub through the gh CLI and its login. Argument arrays only, values
 * attached with `=` so they can never be read as flags, and bodies on stdin
 * (`--body-file -`).
 */
export class GhIssueTracker implements IssueTracker {
  constructor(
    private readonly exec: Exec,
    private readonly repo: string,
  ) {
    if (!REPO_PATTERN.test(repo)) {
      throw new Error(`GITHUB_REPO must look like owner/name, got ${repo}`);
    }
  }

  async listOpen(limit: number): Promise<Issue[]> {
    return this.list(["--state=open", `--limit=${limit}`]);
  }

  async listClosedSince(since: Date, limit: number): Promise<Issue[]> {
    const day = since.toISOString().slice(0, 10);
    return this.list([
      "--state=closed",
      `--search=closed:>=${day}`,
      `--limit=${limit}`,
    ]);
  }

  async openCount(): Promise<number> {
    const [owner, name] = this.repo.split("/");
    const stdout = await this.gh([
      "api",
      "graphql",
      "-F",
      `owner=${owner}`,
      "-F",
      `name=${name}`,
      "-f",
      "query=query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issues(states:OPEN){totalCount}}}",
      "--jq",
      ".data.repository.issues.totalCount",
    ]);
    const count = Number(stdout.trim());
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`gh returned a bad open issue count: ${stdout.trim()}`);
    }
    return count;
  }

  async create(issue: NewIssue): Promise<string> {
    const stdout = await this.gh(
      [
        "issue",
        "create",
        `--repo=${this.repo}`,
        `--title=${issue.title}`,
        "--body-file=-",
        ...issue.labels.map((label) => `--label=${label}`),
      ],
      issue.body,
    );
    return this.url(stdout);
  }

  async comment(issueNumber: number, body: string): Promise<string> {
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      throw new Error(`refusing a bad issue number: ${issueNumber}`);
    }
    const stdout = await this.gh(
      [
        "issue",
        "comment",
        String(issueNumber),
        `--repo=${this.repo}`,
        "--body-file=-",
      ],
      body,
    );
    return this.url(stdout);
  }

  private async list(filters: string[]): Promise<Issue[]> {
    const stdout = await this.gh([
      "issue",
      "list",
      `--repo=${this.repo}`,
      ...filters,
      `--json=${FIELDS}`,
    ]);
    const parsed = z.array(GhIssueSchema).safeParse(JSON.parse(stdout));
    if (!parsed.success) {
      throw new Error(
        `unexpected gh issue list output: ${parsed.error.issues[0]?.message}`,
      );
    }
    return parsed.data.map(toIssue);
  }

  private url(stdout: string): string {
    const url = lastLine(stdout);
    if (!ISSUE_URL.test(url)) {
      throw new Error(`gh did not return a URL: ${url}`);
    }
    return url;
  }

  private async gh(args: string[], input = ""): Promise<string> {
    try {
      const { stdout } = await this.exec({
        file: "gh",
        args,
        input,
        timeoutMs: 60_000,
        env: { GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
      });
      return stdout;
    } catch (error) {
      const detail =
        error instanceof ExecError
          ? stderrTail(error.stderr) || error.message
          : String(error);
      throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`, {
        cause: error,
      });
    }
  }
}

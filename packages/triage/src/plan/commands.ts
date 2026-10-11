import { isCursor, type Cursor } from "./cursor";
import { feedbackQuery } from "./inputs";
import { triagePlanJsonSchema } from "./schema";

/**
 * Every external command a run makes, as [program, argument array]. Never a
 * shell: values are separate array items or attached as `--flag=value` so
 * they can't be read as flags, and bodies go on stdin (`--body-file=-`).
 */
export type Command = [program: string, args: string[]];

export const OPEN_ISSUE_LIMIT = 300;
const ISSUE_FIELDS = "--json=number,state,title,labels,body,author";
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function repoFlag(repo: string): string {
  if (!REPO_PATTERN.test(repo)) throw new Error("repo must be owner/name");
  return `--repo=${repo}`;
}

function issueNumber(n: number | undefined): string {
  if (!Number.isInteger(n) || n! < 1) throw new Error("bad issue number");
  return String(n);
}

export const commands = {
  readFeedback(repoDir: string, cursor: Cursor): Command {
    if (!isCursor(cursor)) throw new Error("refusing a malformed cursor");
    const sql = feedbackQuery(cursor, 500);
    const args = [
      "--workdir",
      repoDir,
      "db",
      "query",
      "--linked",
      "-o",
      "json",
    ];
    return ["supabase", [...args, sql]];
  },

  listOpenIssues(repo: string): Command {
    const limit = `--limit=${OPEN_ISSUE_LIMIT}`;
    return [
      "gh",
      ["issue", "list", repoFlag(repo), "--state=open", limit, ISSUE_FIELDS],
    ];
  },

  listClosedIssues(repo: string, since: Date): Command {
    const search = `--search=closed:>=${since.toISOString().slice(0, 10)}`;
    const args = ["issue", "list", repoFlag(repo), "--state=closed", search];
    return ["gh", [...args, "--limit=200", ISSUE_FIELDS]];
  },

  countOpenIssues(repo: string): Command {
    const [owner, name] = repoFlag(repo).slice("--repo=".length).split("/");
    const query =
      "query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}}}";
    const vars = ["-F", `o=${owner}`, "-F", `n=${name}`];
    const jq = ["--jq", ".data.repository.issues.totalCount"];
    return ["gh", ["api", "graphql", ...vars, "-f", `query=${query}`, ...jq]];
  },

  /** No tools, no MCP servers, no saved session: the model reads and answers. */
  analyze(): Command {
    const schema = JSON.stringify(triagePlanJsonSchema());
    const flags = ["--strict-mcp-config", "--no-session-persistence"];
    const output = ["--output-format", "json", "--json-schema", schema];
    return ["claude", ["-p", "--tools", "", ...flags, ...output]];
  },

  /** Recent issues from the loop (it always labels `feedback`), to find a provenance marker. */
  listLoopIssues(repo: string): Command {
    const filters = ["--state=all", "--label=feedback", "--limit=100"];
    return [
      "gh",
      ["issue", "list", repoFlag(repo), ...filters, "--json=url,body"],
    ];
  },

  createIssue(repo: string, title: string, labels: string[]): Command {
    const flags = [`--title=${title}`, ...labels.map((l) => `--label=${l}`)];
    return [
      "gh",
      ["issue", "create", repoFlag(repo), ...flags, "--body-file=-"],
    ];
  },

  listComments(repo: string, n: number | undefined): Command {
    return [
      "gh",
      ["issue", "view", issueNumber(n), repoFlag(repo), "--json=comments"],
    ];
  },

  comment(repo: string, n: number | undefined): Command {
    return [
      "gh",
      ["issue", "comment", issueNumber(n), repoFlag(repo), "--body-file=-"],
    ];
  },

  /** The message travels as an argv item, never inside the script text. */
  notify(message: string): Command {
    const show = `display notification (item 1 of argv) with title "Café Listo triage"`;
    const script = ["-e", "on run argv", "-e", show, "-e", "end run"];
    return ["osascript", [...script, message]];
  },
};

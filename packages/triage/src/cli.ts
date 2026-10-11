/**
 * `triage run [--dry-run]`: new feedback in, a validated triage plan, issues
 * filed. The rules live in ./plan; this script does the I/O. Every external
 * command is an argument array, never a shell: values are separate items or
 * attached as `--flag=value` so they can't be read as flags, and bodies go on
 * stdin. Logs carry only counts, indexes, action types and URLs.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { feedbackKindSchema } from "@cafe-listo/shared";
import { z } from "zod";
import * as plan from "./plan";
import prompt from "./prompt.md";

const env = process.env;
const STATE = env.TRIAGE_STATE_DIR || join(homedir(), ".cafe-listo/triage");
const REPO_DIR = env.REPO_DIR ?? "";
const REPO = env.GITHUB_REPO || "dtun/cafe-listo";
const TRUSTED = (env.TRIAGE_TRUSTED_AUTHORS ?? "dtun").split(",");
const POLICY = { ...plan.DEFAULT_POLICY, trustedAuthors: TRUSTED };
const CURSOR = join(STATE, "cursor");
const PENDING = join(STATE, "pending.json");
const LOCK = join(STATE, "lock");
const OPEN_ISSUE_LIMIT = 300;
const ISSUE_FIELDS = "--json=number,state,title,labels,body,author";
const log = (line: string) => console.log(line);

/** Runs `cmd` with `args` (never a shell), `input` on stdin and a timeout. */
function run(cmd: string, args: string[], input = "", seconds = 60) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: STATE, // keeps claude away from any checkout's settings
      env: { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out after ${seconds}s`));
    }, seconds * 1000);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${cmd}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = err.trim().split("\n").slice(-3).join(" ");
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args[0]} exited ${code}: ${tail}`));
    });
  });
}

function save(file: string, data: unknown) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file); // atomic: never a half-written file
}

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, "utf8"));

/** O_EXCL lock file holding our pid. A lock whose pid is gone is stale. */
function lock(): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(LOCK, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
      return true;
    } catch {
      const pid = Number(fs.readFileSync(LOCK, "utf8"));
      try {
        if (pid > 0 && process.kill(pid, 0)) return false;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EPERM") return false;
      }
      fs.rmSync(LOCK, { force: true });
    }
  }
  return false;
}

function check(problems: plan.Problem[], what: string) {
  if (problems.length === 0) return;
  const list = problems.map((p) => `- ${p.message}`).join("\n");
  throw new Error(`${what} rejected; nothing filed:\n${list}`);
}

/** A validated plan saved before anything is filed, so a failed run resumes it. */
const PendingPlanSchema = z.strictObject({
  planId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  plan: plan.TriagePlanSchema,
  /** What validatePlan checked the plan against. */
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
  advanceTo: z.custom<plan.Cursor>(plan.isCursor),
  done: z.array(
    z.strictObject({ index: z.int().min(0), url: z.string().nullable() }),
  ),
});
type PendingPlan = z.infer<typeof PendingPlanSchema>;

/** The URL of the first item (issue or comment) whose body carries `marker`. */
function findMarked(items: unknown, marker: string): string | null {
  const Item = z.object({ url: z.string(), body: z.string().nullable() });
  const list = z.array(Item).parse(items);
  return list.find((i) => i.body?.includes(marker))?.url ?? null;
}

/** The last line of `gh issue create|comment` output, which must be a GitHub URL. */
function filedUrl(output: string): string {
  const url = output.trim().split("\n").pop()?.trim() ?? "";
  if (!/^https:\/\/github\.com\/\S+$/.test(url)) {
    throw new Error("gh did not return a URL");
  }
  return url;
}

/** Files each action not yet done. The marker check finds what a crash left on GitHub. */
async function execute(pending: PendingPlan) {
  const { planId, plan: triagePlan, done } = pending;
  for (const [i, action] of triagePlan.actions.entries()) {
    if (done.some((d) => d.index === i)) continue;
    // Hidden in every filed body; lets a resumed plan find what reached GitHub.
    const marker = `<!-- triage:${planId}:${i} -->`;
    const ids = action.feedback_ids.join(", ");
    const body = `${action.body}\n\n---\n<sub>Filed by the weekly feedback triage loop from feedback records: ${ids}</sub>\n${marker}`;
    let url: string | null = null;
    try {
      if (action.type === "create_issue") {
        // The loop always labels `feedback`, so its recent issues are enough.
        const recent = await run("gh", [
          "issue",
          "list",
          `--repo=${REPO}`,
          "--state=all",
          "--label=feedback",
          "--limit=100",
          "--json=url,body",
        ]);
        url = findMarked(JSON.parse(recent), marker);
        const labels = action.labels!.map((l) => `--label=${l}`);
        const args = [
          "issue",
          "create",
          `--repo=${REPO}`,
          `--title=${action.title}`,
          ...labels,
          "--body-file=-",
        ];
        url ??= filedUrl(await run("gh", args, body));
      } else if (action.type === "comment_issue") {
        const n = String(action.issue_number);
        const view = await run("gh", [
          "issue",
          "view",
          n,
          `--repo=${REPO}`,
          "--json=comments",
        ]);
        url = findMarked(JSON.parse(view).comments, marker);
        const args = ["issue", "comment", n, `--repo=${REPO}`, "--body-file=-"];
        url ??= filedUrl(await run("gh", args, body));
      }
    } catch (e) {
      const total = triagePlan.actions.length;
      const where = `action ${i} (${action.type}) failed (${done.length}/${total} done; next run resumes)`;
      throw new Error(`${where}: ${(e as Error).message}`, { cause: e });
    }
    done.push({ index: i, url });
    save(PENDING, pending);
    log(`- action ${i} (${action.type}): ${url ?? "skipped"}`);
  }
  save(CURSOR, pending.advanceTo); // cursor first: a crash here resumes as a no-op
  fs.rmSync(PENDING);
}

/** Feedback strictly after the cursor, oldest first, via the supabase CLI login. */
async function readFeedback(cursor: unknown): Promise<plan.FeedbackRecord[]> {
  // Both parts are interpolated below, so only a strictly valid cursor passes.
  if (!plan.isCursor(cursor)) throw new Error(`${CURSOR} holds no cursor`);
  const sql = [
    "select id, user_id, kind, summary, details, tool_name, item_id, user_quote,",
    `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`,
    "from public.feedback",
    `where (feedback.created_at, feedback.id) > ('${cursor.createdAt}'::timestamptz, '${cursor.id}'::uuid)`,
    "order by feedback.created_at, feedback.id limit 500",
  ].join(" ");
  const args = ["--workdir", REPO_DIR, "db", "query", "--linked", "-o", "json"];
  const output = await run("supabase", [...args, sql], "", 120).catch((e) => {
    const hint = "run `supabase projects list` once to re-authorize Keychain";
    throw /timed out/.test(e.message) ? new Error(`${e.message}; ${hint}`) : e;
  });
  // Output is {boundary, rows, warning}; only `.rows` go on, as data.
  const Row = z.object({
    id: z.string().regex(plan.UUID_PATTERN),
    user_id: z.string(),
    kind: feedbackKindSchema,
    summary: z.string(),
    details: z.string().nullable(),
    tool_name: z.string().nullable(),
    item_id: z.string().nullable(),
    user_quote: z.string().nullable(),
    created_at: z.string().regex(plan.CREATED_AT_PATTERN),
  });
  const { rows } = z.object({ rows: z.array(Row) }).parse(JSON.parse(output));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    summary: r.summary,
    details: r.details,
    toolName: r.tool_name,
    itemId: r.item_id,
    userQuote: r.user_quote,
    createdAt: r.created_at,
  }));
}

/** `gh issue list` output; bodies are untrusted and truncated. */
function parseIssues(output: string) {
  const Issue = z.object({
    number: z.int(),
    state: z.enum(["OPEN", "CLOSED"]),
    title: z.string(),
    body: z.string().nullish(),
    author: z.object({ login: z.string() }).nullable(), // null for ghosts
    labels: z.array(z.object({ name: z.string() })),
  });
  return z
    .array(Issue)
    .parse(JSON.parse(output))
    .map((i) => ({
      number: i.number,
      state: i.state,
      title: i.title,
      author: i.author?.login ?? "",
      labels: i.labels.map((l) => l.name),
      body: (i.body ?? "").slice(0, 400),
    }));
}

/** Runs claude with no tools, no MCP servers and no saved session. */
async function analyze(sections: Record<string, unknown>): Promise<unknown> {
  // Backticks are escaped (still valid JSON), so data can't close its fence.
  const fenced = (value: unknown) =>
    "```json\n" +
    JSON.stringify(value, null, 2).replace(/`/g, "\\u0060") +
    "\n```";
  const input = [
    prompt.trimEnd(),
    ...Object.entries(sections).map(([name, v]) => `## ${name}\n${fenced(v)}`),
  ].join("\n\n");
  const args = [
    "-p",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(plan.triagePlanJsonSchema()),
  ];
  const output = await run("claude", args, input, 600);
  // Only the error subtype is ever reported, never model text.
  const result = z
    .object({
      is_error: z.boolean().optional(),
      subtype: z.string().optional(),
      structured_output: z.unknown(),
    })
    .parse(JSON.parse(output));
  if (result.is_error) {
    const subtype = /^[a-z_]{1,40}$/.test(result.subtype ?? "")
      ? result.subtype
      : "unknown";
    throw new Error(`claude reported an error (${subtype})`);
  }
  if (result.structured_output === undefined) {
    throw new Error("claude returned no structured_output");
  }
  return result.structured_output;
}

async function triage(dryRun: boolean) {
  // 1. Finish an unfinished plan first. The model is never asked again.
  if (fs.existsSync(PENDING)) {
    const pending = PendingPlanSchema.parse(readJson(PENDING));
    const progress = `${pending.done.length}/${pending.plan.actions.length} done`;
    if (dryRun)
      return log(`Unfinished plan (${progress}); a real run resumes it.`);
    const ctx = { ...pending.context, policy: POLICY };
    check(plan.validatePlan(pending.plan, ctx), "pending plan");
    log(`Resuming plan (${progress})`);
    await execute(pending);
  }

  // 2. Feedback past the (created_at, id) cursor.
  const cursor = fs.existsSync(CURSOR) ? readJson(CURSOR) : plan.EPOCH_CURSOR;
  const rows = await readFeedback(cursor);
  if (rows.length === 0) return log("No new feedback.");

  // 3. Open and recently closed issues. A short open list would make dedupe blind.
  const repo = `--repo=${REPO}`;
  const open = parseIssues(
    await run("gh", [
      "issue",
      "list",
      repo,
      "--state=open",
      `--limit=${OPEN_ISSUE_LIMIT}`,
      ISSUE_FIELDS,
    ]),
  );
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const closed = parseIssues(
    await run("gh", [
      "issue",
      "list",
      repo,
      "--state=closed",
      `--search=closed:>=${since}`,
      "--limit=200",
      ISSUE_FIELDS,
    ]),
  );
  const [owner, name] = REPO.split("/");
  const query =
    "query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}}}";
  const total = Number(
    await run("gh", [
      "api",
      "graphql",
      "-F",
      `o=${owner}`,
      "-F",
      `n=${name}`,
      "-f",
      `query=${query}`,
      "--jq",
      ".data.repository.issues.totalCount",
    ]),
  );
  if (!(open.length >= Math.min(total, OPEN_ISSUE_LIMIT))) {
    throw new Error(`open issue list incomplete (${open.length} of ${total})`);
  }
  const issues = [...open, ...closed];

  // 4. Analyze with no tools, then parse and validate. Any problem files nothing.
  const parsed = plan.parsePlan(
    await analyze({
      "TRUSTED AUTHORS": TRUSTED,
      FEEDBACK: plan.aliasReporters(rows),
      ISSUES: issues,
    }),
  );
  if (!parsed.ok) return check(parsed.problems, "analyzer output");
  const refs = issues.map(({ number, state, author, labels }) => ({
    number,
    state,
    author,
    labels,
  }));
  const context = { feedbackIds: rows.map((r) => r.id), issues: refs };
  check(plan.validatePlan(parsed.plan, { ...context, policy: POLICY }), "plan");

  const types = parsed.plan.actions.map((a) => a.type);
  const count = (type: string) => types.filter((t) => t === type).length;
  log(
    `${rows.length} feedback: ${count("create_issue")} issue(s), ${count("comment_issue")} comment(s), ${count("skip")} skip(s)`,
  );
  if (dryRun)
    return types.forEach((t, i) => log(`- action ${i} (${t}): (dry run)`));

  // 5. Save the plan as pending, then file it; the cursor moves only when all of it is done.
  const pending = {
    planId: randomUUID(),
    plan: parsed.plan,
    context,
    advanceTo: plan.latestCursor(rows),
    done: [],
  };
  save(PENDING, pending);
  await execute(pending);
}

async function main(): Promise<number> {
  const [command, ...flags] = process.argv.slice(2);
  if (command !== "run" || flags.some((f) => f !== "--dry-run")) {
    console.error("usage: triage run [--dry-run]");
    return 2;
  }
  const dryRun = flags.length > 0;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) {
    console.error(`triage: GITHUB_REPO must be owner/name`);
    return 1;
  }
  if (!fs.existsSync(join(REPO_DIR, "supabase/.temp/project-ref"))) {
    console.error(`triage: no supabase link in REPO_DIR=${REPO_DIR}`);
    return 1;
  }
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  if (!dryRun && !lock()) {
    console.error("triage: another run holds the lock");
    return 1;
  }
  let message = dryRun ? "Dry run finished." : "Triage finished.";
  try {
    await triage(dryRun);
  } catch (e) {
    message = `Triage failed: ${(e as Error).message}`;
    console.error(message);
  } finally {
    if (!dryRun) fs.rmSync(LOCK, { force: true });
  }
  if (process.platform === "darwin") {
    // The message travels as an argv item, never inside the script text.
    const show = `display notification (item 1 of argv) with title "Café Listo triage"`;
    const script = ["-e", "on run argv", "-e", show, "-e", "end run"];
    await run("osascript", [...script, message.split("\n")[0]], "", 10).catch(
      () => {},
    );
  }
  return message.startsWith("Triage failed") ? 1 : 0;
}

main().then((code) => (process.exitCode = code));

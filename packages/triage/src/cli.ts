/**
 * `triage run [--dry-run]`: new feedback in, a validated triage plan, issues
 * filed. Every rule, every command line and every parse of untrusted input
 * lives in ./plan; this script runs them top to bottom. Logs carry only
 * counts, indexes, action types and URLs.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as plan from "./plan";
import { commands } from "./plan";
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
const log = (line: string) => console.log(line);

/** Runs a command (an argument array, never a shell) with `input` on stdin and a timeout. */
function run([cmd, args]: plan.Command, input = "", seconds = 60) {
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

/** Files each action not yet done. The marker check finds what a crash left on GitHub. */
async function execute(pending: plan.PendingPlan) {
  const { planId, plan: triagePlan, done } = pending;
  for (const [i, action] of triagePlan.actions.entries()) {
    if (done.some((d) => d.index === i)) continue;
    const marker = plan.provenanceMarker(planId, i);
    const footer = plan.provenanceFooter(action.feedback_ids, planId, i);
    const body = `${action.body}${footer}`;
    let url: string | null = null;
    try {
      if (action.type === "create_issue") {
        const recent = await run(commands.listLoopIssues(REPO));
        const create = commands.createIssue(
          REPO,
          action.title!,
          action.labels!,
        );
        url = plan.findMarked(recent, marker);
        url ??= plan.parseFiledUrl(await run(create, body));
      } else if (action.type === "comment_issue") {
        const n = action.issue_number;
        const comments = await run(commands.listComments(REPO, n));
        url = plan.findMarked(comments, marker);
        url ??= plan.parseFiledUrl(await run(commands.comment(REPO, n), body));
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

async function triage(dryRun: boolean) {
  // 1. Finish an unfinished plan first. The model is never asked again.
  if (fs.existsSync(PENDING)) {
    const pending = plan.PendingPlanSchema.parse(readJson(PENDING));
    const progress = `${pending.done.length}/${pending.plan.actions.length} done`;
    if (dryRun)
      return log(`Unfinished plan (${progress}); a real run resumes it.`);
    const ctx = { ...pending.context, policy: POLICY };
    check(plan.validatePlan(pending.plan, ctx), "pending plan");
    log(`Resuming plan (${progress})`);
    await execute(pending);
  }

  // 2. Feedback past the (created_at, id) cursor, read with the supabase CLI login.
  const cursor = fs.existsSync(CURSOR) ? readJson(CURSOR) : plan.EPOCH_CURSOR;
  if (!plan.isCursor(cursor)) throw new Error(`${CURSOR} holds no cursor`);
  const feedbackOut = await run(
    commands.readFeedback(REPO_DIR, cursor),
    "",
    120,
  ).catch((e) => {
    const hint = "run `supabase projects list` once to re-authorize Keychain";
    throw /timed out/.test(e.message) ? new Error(`${e.message}; ${hint}`) : e;
  });
  const rows = plan.parseFeedbackRows(feedbackOut);
  if (rows.length === 0) return log("No new feedback.");

  // 3. Open and recently closed issues. A short open list would make dedupe blind.
  const open = plan.parseIssues(await run(commands.listOpenIssues(REPO)));
  const since = new Date(Date.now() - 90 * 864e5);
  const closed = plan.parseIssues(
    await run(commands.listClosedIssues(REPO, since)),
  );
  const total = Number(await run(commands.countOpenIssues(REPO)));
  if (!(open.length >= Math.min(total, plan.OPEN_ISSUE_LIMIT))) {
    throw new Error(`open issue list incomplete (${open.length} of ${total})`);
  }
  const issues = [...open, ...closed];

  // 4. Analyze with no tools, then parse and validate. Any problem files nothing.
  const sections = {
    "TRUSTED AUTHORS": TRUSTED,
    FEEDBACK: plan.aliasReporters(rows),
    ISSUES: issues,
  };
  const input = plan.buildPrompt(prompt, sections);
  const parsed = plan.parsePlan(
    plan.parseAnalyzerOutput(await run(commands.analyze(), input, 600)),
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
  const advanceTo = plan.latestCursor(rows.map(plan.cursorOf));
  const pending = {
    planId: randomUUID(),
    plan: parsed.plan,
    context,
    advanceTo,
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
    await run(commands.notify(message.split("\n")[0]), "", 10).catch(() => {});
  }
  return message.startsWith("Triage failed") ? 1 : 0;
}

main().then((code) => (process.exitCode = code));

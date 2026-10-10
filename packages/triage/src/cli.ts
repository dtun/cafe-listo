/**
 * Driving adapter: `triage run [--dry-run]`. Config comes from the
 * environment (see container.ts); the report goes to stdout.
 */
import { mkdirSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cliContainer, loadConfig, type CliRuntime } from "./container";
import type { TriageReport } from "./usecases/triage-feedback";
import type { TriageError } from "./usecases/types";

const USAGE = "usage: triage run [--dry-run]";

export interface CliIo extends CliRuntime {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  home?: string;
}

export function formatReport(report: TriageReport): string {
  const lines = [
    `# Feedback triage${report.dryRun ? " (dry run)" : ""}`,
    `cursor: ${report.cursor.from} -> ${report.cursor.to}`,
  ];
  if (report.resumed) {
    lines.push("", `## Resumed pending plan (${report.resumed.length} filed)`);
    for (const a of report.resumed) lines.push(`- ${a.target}: ${a.url}`);
  }
  if (report.status === "pending_plan") {
    lines.push(
      "",
      `Unfinished plan: ${report.pending?.done}/${report.pending?.total} actions done; a real run resumes it first.`,
    );
    return lines.join("\n");
  }
  if (report.status === "nothing_new") {
    lines.push("", "No new feedback.");
    return lines.join("\n");
  }
  lines.push(
    "",
    `${report.feedbackCount} feedback item(s).`,
    "",
    report.summary ?? "",
  );
  lines.push("", "## Actions");
  for (const a of report.actions) {
    const verb = a.type === "create_issue" ? "Create" : "Comment on";
    lines.push(
      `- ${verb} ${a.target}: ${a.url ?? "(dry run)"} [${a.feedbackIds.join(", ")}] ${a.reason}`,
    );
  }
  if (report.skips.length) {
    lines.push("", "## Skipped");
    for (const s of report.skips) {
      lines.push(`- ${s.feedbackIds.join(", ")}: ${s.reason}`);
    }
  }
  return lines.join("\n");
}

function formatError(error: TriageError): string {
  return [
    `triage failed (${error.code}): ${error.message}`,
    ...(error.problems ?? []).map((p) => `- ${p.message}`),
  ].join("\n");
}

function notification(report: TriageReport): string {
  if (report.status === "nothing_new") return "No new feedback.";
  if (report.status === "pending_plan") return "Unfinished plan pending.";
  const creates = report.actions.filter(
    (a) => a.type === "create_issue",
  ).length;
  const comments = report.actions.length - creates;
  return `${report.feedbackCount} feedback item(s): ${creates} issue(s), ${comments} comment(s)${report.dryRun ? " (dry run)" : ""}.`;
}

/** Returns the process exit code. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  const [command, ...flags] = argv;
  const unknown = flags.filter((flag) => flag !== "--dry-run");
  if (command !== "run" || unknown.length) {
    io.err(USAGE);
    return 2;
  }
  const dryRun = flags.includes("--dry-run");

  let config;
  try {
    config = loadConfig(io.env, io.home);
  } catch (error) {
    io.err(`triage: ${(error as Error).message}`);
    return 1;
  }
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });

  const { triageFeedback, notifier } = cliContainer(config, io);
  const result = await triageFeedback.execute({ dryRun });
  if (!result.ok) {
    io.err(formatError(result.error));
    await notifier.notify(`Failed: ${result.error.message}`);
    return 1;
  }
  io.out(formatReport(result.data));
  await notifier.notify(notification(result.data));
  return 0;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main(process.argv.slice(2), {
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}

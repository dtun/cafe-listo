import { spawn } from "node:child_process";

/**
 * The process seam. Adapters build argument arrays and hand them to an Exec;
 * tests inject a fake and assert on the arrays. Never a shell.
 */
export interface ExecRequest {
  file: string;
  args: string[];
  /** Written to stdin, then stdin is closed (empty when omitted). */
  input?: string;
  cwd?: string;
  timeoutMs?: number;
  /** Merged over the parent environment. */
  env?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type Exec = (request: ExecRequest) => Promise<ExecResult>;

export class ExecError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

/** Last few lines of stderr, for error messages. */
export function stderrTail(stderr: string, lines = 5): string {
  return stderr.trim().split("\n").slice(-lines).join("\n");
}

export const nodeExec: Exec = (request) =>
  new Promise((resolve, reject) => {
    const child = spawn(request.file, request.args, {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = request.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, request.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", () => {
      // The child may exit without reading stdin; its exit status tells the story.
    });
    child.stdin.end(request.input ?? "");

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      const reason =
        error.code === "ENOENT"
          ? `${request.file} not found on PATH`
          : error.message;
      reject(new ExecError(reason, null, stderr, false));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(
          new ExecError(
            `${request.file} timed out after ${request.timeoutMs}ms`,
            code,
            stderr,
            true,
          ),
        );
      } else if (code !== 0) {
        reject(
          new ExecError(
            `${request.file} exited ${code}: ${stderrTail(stderr)}`,
            code,
            stderr,
            false,
          ),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

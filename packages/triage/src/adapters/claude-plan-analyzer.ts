import { triagePlanJsonSchema } from "../plan";
import type { AnalyzerInput, PlanAnalyzer } from "../ports";
import { ExecError, stderrTail, type Exec } from "./exec";

export const CLAUDE_TIMEOUT_MS = 10 * 60_000;

/**
 * JSON with every backtick escaped (still valid JSON), so untrusted text can
 * never close the fence it sits in.
 */
function fencedJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2).replace(/`/g, "\\u0060");
  return "```json\n" + json + "\n```";
}

export function buildPrompt(
  instructions: string,
  input: AnalyzerInput,
): string {
  return [
    instructions.trimEnd(),
    "",
    "## TRUSTED AUTHORS",
    fencedJson(input.trustedAuthors),
    "",
    "## FEEDBACK",
    fencedJson(input.feedback),
    "",
    "## ISSUES",
    fencedJson(input.issues),
    "",
  ].join("\n");
}

export function claudeArgs(schema: Record<string, unknown>): string[] {
  return [
    "-p",
    // No tools at all, no MCP servers, nothing saved: the model reads and answers.
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
  ];
}

export interface ClaudePlanAnalyzerOptions {
  /** The analyst instructions (src/prompt.md). */
  instructions: string;
  /** Run outside any checkout so no project settings or CLAUDE.md load. */
  cwd: string;
  timeoutMs?: number;
}

/** Headless `claude -p` with no tools. Returns `.structured_output`, unparsed. */
export class ClaudePlanAnalyzer implements PlanAnalyzer {
  constructor(
    private readonly exec: Exec,
    private readonly options: ClaudePlanAnalyzerOptions,
  ) {}

  async analyze(input: AnalyzerInput): Promise<unknown> {
    let stdout: string;
    try {
      ({ stdout } = await this.exec({
        file: "claude",
        args: claudeArgs(triagePlanJsonSchema()),
        input: buildPrompt(this.options.instructions, input),
        cwd: this.options.cwd,
        timeoutMs: this.options.timeoutMs ?? CLAUDE_TIMEOUT_MS,
      }));
    } catch (error) {
      const detail =
        error instanceof ExecError
          ? stderrTail(error.stderr) || error.message
          : String(error);
      throw new Error(`claude run failed: ${detail}`, { cause: error });
    }

    let result: {
      is_error?: boolean;
      result?: unknown;
      structured_output?: unknown;
    };
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error("claude returned output that is not JSON");
    }
    if (result.is_error) {
      throw new Error(`claude reported an error: ${String(result.result)}`);
    }
    if (result.structured_output === undefined) {
      throw new Error("claude returned no structured_output");
    }
    return result.structured_output;
  }
}

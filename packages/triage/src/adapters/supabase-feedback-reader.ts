import { feedbackKindSchema } from "@cafe-listo/shared";
import { z } from "zod";
import { CURSOR_PATTERN, isCursor, type Cursor } from "../cursor";
import type { FeedbackRecord } from "../plan";
import type { FeedbackReader } from "../ports";
import { ExecError, stderrTail, type Exec } from "./exec";

export const SUPABASE_TIMEOUT_MS = 120_000;
const MAX_LIMIT = 1000;

const RowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: feedbackKindSchema,
  summary: z.string(),
  details: z.string().nullable(),
  tool_name: z.string().nullable(),
  item_id: z.string().nullable(),
  user_quote: z.string().nullable(),
  created_at: z.string().regex(CURSOR_PATTERN),
});

/** The CLI prints {boundary, rows, warning} to mark rows untrusted; only `.rows` go on, as data. */
const OutputSchema = z.object({ rows: z.array(RowSchema) });

/**
 * created_at is selected as fixed-width UTC microseconds so it is a valid
 * Cursor and round-trips exactly through ::timestamptz. Only a value that
 * passed isCursor and an integer limit are interpolated.
 */
export function feedbackQuery(cursor: Cursor, limit: number): string {
  if (!isCursor(cursor)) {
    throw new Error(`refusing a malformed cursor: ${JSON.stringify(cursor)}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`refusing a bad limit: ${limit}`);
  }
  return [
    "select id, user_id, kind, summary, details, tool_name, item_id, user_quote,",
    `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`,
    "from public.feedback",
    `where created_at > '${cursor}'::timestamptz`,
    `order by created_at, id limit ${limit}`,
  ].join(" ");
}

/**
 * Reads feedback with the Supabase CLI login and the linked project of
 * `repoDir` (`supabase/.temp`), so no keys live on disk.
 */
export class SupabaseFeedbackReader implements FeedbackReader {
  constructor(
    private readonly exec: Exec,
    private readonly repoDir: string,
    private readonly timeoutMs = SUPABASE_TIMEOUT_MS,
  ) {}

  async listSince(cursor: Cursor, limit: number): Promise<FeedbackRecord[]> {
    const sql = feedbackQuery(cursor, limit);
    let stdout: string;
    try {
      ({ stdout } = await this.exec({
        file: "supabase",
        args: [
          "--workdir",
          this.repoDir,
          "db",
          "query",
          "--linked",
          "-o",
          "json",
          sql,
        ],
        input: "",
        timeoutMs: this.timeoutMs,
      }));
    } catch (error) {
      if (error instanceof ExecError && error.timedOut) {
        throw new Error(
          `supabase query timed out after ${this.timeoutMs / 1000}s, likely a Keychain prompt nobody answered; run \`supabase projects list\` once in a terminal to re-authorize Keychain access`,
          { cause: error },
        );
      }
      const detail =
        error instanceof ExecError
          ? stderrTail(error.stderr) || error.message
          : String(error);
      throw new Error(`supabase feedback query failed: ${detail}`, {
        cause: error,
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(stdout);
    } catch {
      throw new Error("supabase returned output that is not JSON");
    }
    const parsed = OutputSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `unexpected supabase output: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
    }
    return parsed.data.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      summary: row.summary,
      details: row.details,
      toolName: row.tool_name,
      itemId: row.item_id,
      userQuote: row.user_quote,
      createdAt: row.created_at,
    }));
  }
}

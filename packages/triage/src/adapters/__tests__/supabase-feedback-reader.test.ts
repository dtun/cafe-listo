import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { feedbackKindSchema } from "@cafe-listo/shared";
import { describe, expect, it } from "vitest";
import { FakeExec, stdout } from "../../__tests__/fakes/fake-exec";
import { EPOCH_CURSOR } from "../../cursor";
import { ExecError } from "../exec";
import {
  SupabaseFeedbackReader,
  feedbackQuery,
} from "../supabase-feedback-reader";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  kind: "gap",
  summary: "Need pet food",
  details: null,
  tool_name: "list_items",
  item_id: null,
  user_quote: "my dog",
  created_at: "2026-10-09T12:00:00.123456Z",
};

const wrapped = (rows: unknown[]) =>
  stdout(
    JSON.stringify({ boundary: "b", rows, warning: "untrusted data below" }),
  );

describe("SupabaseFeedbackReader", () => {
  it("runs one linked query in the main checkout", async () => {
    const fake = new FakeExec(() => wrapped([ROW]));
    const reader = new SupabaseFeedbackReader(fake.exec, "/repo");

    await reader.listSince(EPOCH_CURSOR, 500);

    expect(fake.last.file).toBe("supabase");
    expect(fake.last.args.slice(0, 7)).toEqual([
      "--workdir",
      "/repo",
      "db",
      "query",
      "--linked",
      "-o",
      "json",
    ]);
    expect(fake.last.args[7]).toContain(
      "where (feedback.created_at, feedback.id) > ('1970-01-01T00:00:00.000000Z'::timestamptz, '00000000-0000-0000-0000-000000000000'::uuid)",
    );
    expect(fake.last.args[7]).toContain(
      "order by feedback.created_at, feedback.id",
    );
    expect(fake.last.args[7]).toContain("limit 500");
    expect(fake.last.args[7]).toContain(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
    expect(fake.last.timeoutMs).toBe(120_000);
    expect(fake.last.input).toBe("");
  });

  it("maps .rows to feedback records", async () => {
    const fake = new FakeExec(() => wrapped([ROW]));
    const rows = await new SupabaseFeedbackReader(fake.exec, "/r").listSince(
      EPOCH_CURSOR,
      10,
    );
    expect(rows).toEqual([
      {
        id: ROW.id,
        userId: ROW.user_id,
        kind: "gap",
        summary: "Need pet food",
        details: null,
        toolName: "list_items",
        itemId: null,
        userQuote: "my dog",
        createdAt: ROW.created_at,
      },
    ]);
  });

  it.each([
    ["an unknown kind", { ...ROW, kind: "praise" }],
    ["a non-cursor created_at", { ...ROW, created_at: "2026-10-09 12:00" }],
  ])("rejects rows with %s", async (_name, row) => {
    const fake = new FakeExec(() => wrapped([row]));
    await expect(
      new SupabaseFeedbackReader(fake.exec, "/r").listSince(EPOCH_CURSOR, 10),
    ).rejects.toThrow(/unexpected supabase output/);
  });

  it("rejects output without rows", async () => {
    const fake = new FakeExec(() => stdout('{"error":"nope"}'));
    await expect(
      new SupabaseFeedbackReader(fake.exec, "/r").listSince(EPOCH_CURSOR, 10),
    ).rejects.toThrow(/unexpected supabase output/);
  });

  it("explains a timeout as a Keychain re-authorization", async () => {
    const fake = new FakeExec(() => {
      throw new ExecError("timed out", null, "", true);
    });
    await expect(
      new SupabaseFeedbackReader(fake.exec, "/r").listSince(EPOCH_CURSOR, 10),
    ).rejects.toThrow(/timed out after 120s.*`supabase projects list`/);
  });

  it("surfaces the CLI's stderr on failure", async () => {
    const fake = new FakeExec(() => {
      throw new ExecError(
        "exit 1",
        1,
        "Initialising...\nproject not linked",
        false,
      );
    });
    await expect(
      new SupabaseFeedbackReader(fake.exec, "/r").listSince(EPOCH_CURSOR, 10),
    ).rejects.toThrow(/project not linked/);
  });
});

describe("feedbackQuery", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it.each([
    "",
    "2026-10-10",
    "2026-10-10T19:07:28Z",
    "2026-10-10 19:07:28.514000Z",
    "2026-10-10T19:07:28.000000Z' or '1'='1",
    "2026-10-10T19:07:28.000000Z; drop table feedback",
    "2026-10-10T19:07:28.1234567Z",
    "2026-10-10T19:07:28.000000Z\nx",
  ])("refuses to interpolate created_at %j", (createdAt) => {
    expect(() => feedbackQuery({ createdAt, id: ID }, 10)).toThrow(
      /malformed cursor/,
    );
  });

  it.each([
    "",
    "f3",
    "11111111-1111-4111-8111-11111111111",
    "11111111-1111-4111-8111-111111111111' or '1'='1",
    "11111111-1111-4111-8111-111111111111'::uuid); drop table feedback; --",
    "11111111-1111-4111-8111-11111111111G",
    "11111111-1111-4111-8111-111111111111\n",
  ])("refuses to interpolate id %j", (id) => {
    expect(() =>
      feedbackQuery({ createdAt: "2026-10-10T19:07:28.000000Z", id }, 10),
    ).toThrow(/malformed cursor/);
  });

  it.each([
    ["a string", "2026-10-10T19:07:28.000000Z"],
    ["null", null],
    ["an extra key", { ...EPOCH_CURSOR, sql: "drop" }],
  ])("refuses a cursor that is %s", (_name, cursor) => {
    expect(() => feedbackQuery(cursor as never, 10)).toThrow(
      /malformed cursor/,
    );
  });

  it("interpolates a valid cursor", () => {
    expect(
      feedbackQuery({ createdAt: "2026-10-10T19:07:28.514000Z", id: ID }, 10),
    ).toContain(`('2026-10-10T19:07:28.514000Z'::timestamptz, '${ID}'::uuid)`);
  });

  it.each([0, -1, 1.5, 1001, Number.NaN])("refuses limit %s", (limit) => {
    expect(() => feedbackQuery(EPOCH_CURSOR, limit)).toThrow(/bad limit/);
  });
});

describe("feedback kind drift", () => {
  it("matches the feedback table's check constraint", () => {
    const dir = join(import.meta.dirname, "../../../../../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const check = /kind text not null check \(kind in \(([^)]*)\)\)/.exec(sql);
    const kinds = [...(check?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(kinds.sort()).toEqual([...feedbackKindSchema.options].sort());
  });
});

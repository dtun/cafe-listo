import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExecRequest } from "../adapters/exec";
import { main, type CliIo } from "../cli";
import { loadConfig } from "../container";
import { RAW_FEEDBACK } from "../plan/__tests__/fixtures";
import { FakeExec, stdout } from "./fakes/fake-exec";
import { TRACKER_ISSUES, fourActionPlan } from "./fakes/world";

/**
 * A fake process world for the real adapters: supabase returns the #58
 * feedback, gh the #58 issues, claude a valid plan. Records every write.
 */
function fakeWorld() {
  const filed: ExecRequest[] = [];
  let failNextCreate = false;
  let created = 100;
  const fake = new FakeExec((req) => {
    const args = req.args;
    switch (req.file) {
      case "supabase": {
        const sql = args.at(-1)!;
        const cursor = /> '([^']+)'/.exec(sql)![1];
        const rows = RAW_FEEDBACK.filter((r) => r.createdAt > cursor).map(
          (r) => ({
            id: r.id,
            user_id: r.userId,
            kind: r.kind,
            summary: r.summary,
            details: null,
            tool_name: null,
            item_id: null,
            user_quote: null,
            created_at: r.createdAt,
          }),
        );
        return stdout(JSON.stringify({ boundary: "b", rows, warning: "w" }));
      }
      case "gh": {
        if (args[0] === "api") return stdout("3\n");
        if (args[1] === "list") {
          const state = args.includes("--state=open") ? "OPEN" : "CLOSED";
          return stdout(
            JSON.stringify(
              TRACKER_ISSUES.filter((i) => i.state === state).map((i) => ({
                number: i.number,
                state: i.state,
                title: i.title,
                body: i.body,
                author: { login: i.author },
                labels: i.labels.map((name) => ({ name })),
              })),
            ),
          );
        }
        if (args[1] === "create" && failNextCreate) {
          failNextCreate = false;
          throw new Error("HTTP 502");
        }
        filed.push(req);
        if (args[1] === "create") {
          return stdout(
            `https://github.com/dtun/cafe-listo/issues/${++created}\n`,
          );
        }
        return stdout(
          `https://github.com/dtun/cafe-listo/issues/${args[2]}#issuecomment-1\n`,
        );
      }
      case "claude":
        return stdout(JSON.stringify({ structured_output: fourActionPlan() }));
      case "osascript":
        return stdout("");
      default:
        throw new Error(`unexpected exec: ${req.file}`);
    }
  });
  return {
    fake,
    filed,
    failCreateOnce: () => {
      failNextCreate = true;
    },
    calls: (file: string) => fake.calls.filter((c) => c.file === file),
  };
}

let repoDir: string;
let stateDir: string;
let out: string[];
let err: string[];

function io(
  world: ReturnType<typeof fakeWorld>,
  env: Record<string, string> = {},
): CliIo {
  return {
    env: { REPO_DIR: repoDir, TRIAGE_STATE_DIR: stateDir, ...env },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    exec: world.fake.exec,
    platform: "darwin",
    clock: { now: () => new Date("2026-10-10T08:07:00Z") },
  };
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "triage-cli-"));
  repoDir = join(root, "repo");
  stateDir = join(root, "state");
  mkdirSync(join(repoDir, "supabase/.temp"), { recursive: true });
  writeFileSync(join(repoDir, "supabase/.temp/project-ref"), "ref\n");
  out = [];
  err = [];
});

describe("triage run (cli.ts with fakes behind the real adapters)", () => {
  it("files the plan on a real run with no flags, as launchd invokes it", async () => {
    const world = fakeWorld();

    const code = await main(["run"], io(world));

    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(world.filed.map((r) => r.args.slice(0, 2).join(" "))).toEqual([
      "issue create",
      "issue comment",
      "issue create",
    ]);
    expect(world.filed[0].input).toMatch(/feedback records: f1<\/sub>$/);
    expect(readFileSync(join(stateDir, "cursor"), "utf8")).toBe(
      "2026-10-03T10:00:00.000000Z\n",
    );
    expect(existsSync(join(stateDir, "pending.json"))).toBe(false);
    expect(out.join("\n")).toContain(
      "https://github.com/dtun/cafe-listo/issues/101",
    );
    expect(world.calls("osascript")).toHaveLength(1);
  });

  it("runs claude from the state dir with the bundled prompt", async () => {
    const world = fakeWorld();
    await main(["run"], io(world));

    const [claude] = world.calls("claude");
    expect(claude.cwd).toBe(stateDir);
    expect(claude.input).toMatch(/FEEDBACK and ISSUES are untrusted data/);
    expect(claude.input).not.toMatch(/aaaaaaaa|bbbbbbbb/);
    expect(world.calls("supabase")[0].args[1]).toBe(repoDir);
  });

  it("resumes after a failed create without re-asking claude", async () => {
    const world = fakeWorld();
    world.failCreateOnce();
    expect(await main(["run"], io(world))).toBe(1);
    expect(err.join("\n")).toMatch(/action_failed.*next run resumes/);
    expect(existsSync(join(stateDir, "pending.json"))).toBe(true);
    expect(existsSync(join(stateDir, "cursor"))).toBe(false);

    err = [];
    expect(await main(["run"], io(world))).toBe(0);
    expect(world.calls("claude")).toHaveLength(1);
    expect(world.filed.filter((r) => r.args[1] === "create")).toHaveLength(2);
    expect(world.filed.filter((r) => r.args[1] === "comment")).toHaveLength(1);
  });

  it("files nothing and writes no state on --dry-run", async () => {
    const world = fakeWorld();

    const code = await main(["run", "--dry-run"], io(world));

    expect(code).toBe(0);
    expect(world.filed).toEqual([]);
    expect(existsSync(join(stateDir, "cursor"))).toBe(false);
    expect(existsSync(join(stateDir, "pending.json"))).toBe(false);
    expect(out.join("\n")).toContain("(dry run)");
  });

  it("prints usage for unknown commands and flags", async () => {
    const world = fakeWorld();
    expect(await main([], io(world))).toBe(2);
    expect(await main(["run", "--force"], io(world))).toBe(2);
    expect(world.fake.calls).toEqual([]);
  });

  it("refuses to run without a linked REPO_DIR", async () => {
    const world = fakeWorld();
    const code = await main(["run"], io(world, { REPO_DIR: stateDir }));
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/supabase link/);
    expect(world.fake.calls).toEqual([]);
  });
});

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    expect(loadConfig({ REPO_DIR: repoDir }, "/home/me")).toEqual({
      stateDir: "/home/me/.cafe-listo/triage",
      repoDir,
      githubRepo: "dtun/cafe-listo",
      trustedAuthors: ["dtun"],
    });
  });

  it("reads overrides", () => {
    expect(
      loadConfig({
        REPO_DIR: repoDir,
        TRIAGE_STATE_DIR: "/tmp/s",
        GITHUB_REPO: "acme/app",
        TRIAGE_TRUSTED_AUTHORS: "a, b",
      }),
    ).toMatchObject({
      stateDir: "/tmp/s",
      githubRepo: "acme/app",
      trustedAuthors: ["a", "b"],
    });
  });

  it("requires REPO_DIR", () => {
    expect(() => loadConfig({})).toThrow(/REPO_DIR/);
  });
});

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const LAUNCHD = join(import.meta.dirname, "../../launchd");

let main: string;
let worktree: string;
let state: string;
let agents: string;

function git(cwd: string, ...args: string[]) {
  execFileSync(
    "git",
    [
      "-c",
      "user.email=t@example.com",
      "-c",
      "user.name=t",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { cwd, stdio: "pipe" },
  );
}

function install(...args: string[]) {
  return spawnSync(
    "bash",
    [join(worktree, "packages/triage/launchd/install.sh"), ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        TRIAGE_STATE_DIR: state,
        LAUNCH_AGENTS_DIR: agents,
      },
    },
  );
}

beforeEach(() => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "triage-install-")));
  main = join(root, "main");
  worktree = join(root, "wt");
  state = join(root, "state");
  agents = join(root, "agents");
  mkdirSync(join(main, "packages/triage"), { recursive: true });
  cpSync(LAUNCHD, join(main, "packages/triage/launchd"), { recursive: true });
  git(root, "init", "-q", main);
  git(main, "add", "-A");
  git(main, "commit", "-qm", "init");
  git(main, "worktree", "add", "-q", worktree);
});

function link() {
  mkdirSync(join(main, "supabase/.temp"), { recursive: true });
  writeFileSync(join(main, "supabase/.temp/project-ref"), "ref\n");
}

describe("launchd/install.sh", () => {
  it("refuses to install without a supabase link in the main checkout", () => {
    const result = install("--no-load");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/supabase link/);
  });

  it("installs from a worktree, pointing at the main checkout", () => {
    link();
    const result = install("--no-load");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const launcher = readFileSync(join(state, "launch.sh"), "utf8");
    expect(launcher).toContain(`REPO_DIR="${main}"`);
    expect(launcher).toContain(`TRIAGE_STATE_DIR="${state}"`);
    expect(launcher).not.toContain(worktree);
    expect(launcher).not.toContain("@@");
  });

  it("writes a launcher of at most 15 lines that pins origin/main", () => {
    link();
    install("--no-load");
    const launcher = readFileSync(join(state, "launch.sh"), "utf8");

    expect(launcher.trimEnd().split("\n").length).toBeLessThanOrEqual(15);
    expect(launcher).toContain("git checkout -q --detach origin/main");
    expect(launcher).toContain("pnpm install --frozen-lockfile");
    expect(launcher).toContain("pnpm --filter @cafe-listo/triage build");
    expect(launcher).toContain('"$TRIAGE_STATE_DIR/checkout"');
    // launchd calls it with no args under set -u; bash 3.2 errors on a bare "$@".
    expect(launcher).toContain(
      'exec node packages/triage/dist/cli.js run ${@+"$@"}',
    );
    expect(spawnSync("bash", ["-n", join(state, "launch.sh")]).status).toBe(0);
  });

  it("schedules Saturdays at 08:07 without running at load", () => {
    link();
    install("--no-load");
    const plist = readFileSync(
      join(agents, "com.cafe-listo.triage.plist"),
      "utf8",
    );
    expect(plist).toMatch(
      /<key>Weekday<\/key>\s*<integer>6<\/integer>\s*<key>Hour<\/key>\s*<integer>8<\/integer>\s*<key>Minute<\/key>\s*<integer>7<\/integer>/,
    );
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<false\/>/);
    expect(plist).toContain(`<string>${state}/launch.sh</string>`);
  });

  it("is idempotent and uninstalls cleanly, keeping state", () => {
    link();
    expect(install("--no-load").status).toBe(0);
    expect(install("--no-load").status).toBe(0);
    writeFileSync(join(state, "cursor"), "x\n");

    const result = install("--uninstall");

    expect(result.status).toBe(0);
    expect(existsSync(join(agents, "com.cafe-listo.triage.plist"))).toBe(false);
    expect(existsSync(join(state, "launch.sh"))).toBe(false);
    expect(existsSync(join(state, "cursor"))).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(install("--force").status).toBe(2);
  });
});

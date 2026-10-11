import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : sourceFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
}

function violations(dir: string, banned: RegExp[]): string[] {
  return sourceFiles(join(SRC, dir)).flatMap((file) =>
    importsOf(file)
      .filter((spec) => banned.some((re) => re.test(spec)))
      .map((spec) => `${relative(SRC, file)} imports ${spec}`),
  );
}

/** The plan module and the use case reach the outside world only through ports. */
const BANNED = [
  /adapters\//,
  /(^|\/)container$/,
  /(^|\/)cli$/,
  /^(node:)?child_process$/,
  /^(node:)?fs(\/promises)?$/,
];

/** Ports, the use case and adapters depend on the plan module, never the other way round. */
const PLAN_BANNED = [
  ...BANNED,
  /(^|\/)ports$/,
  /(^|\/)usecases(\/|$)/,
  /(^|\/)adapters$/,
];

describe("layer isolation", () => {
  it("keeps the plan module pure and dependency-free", () => {
    expect(violations("plan", PLAN_BANNED)).toEqual([]);
  });

  it.each([
    "../ports",
    "../usecases/triage-feedback",
    "../usecases/types",
    "../adapters/exec",
    "../container",
  ])("would catch the plan module importing %s", (spec) => {
    expect(PLAN_BANNED.some((re) => re.test(spec))).toBe(true);
  });

  it("lets the plan module import its own files, shared and zod", () => {
    for (const spec of ["./schema", "./types", "@cafe-listo/shared", "zod"]) {
      expect(PLAN_BANNED.some((re) => re.test(spec))).toBe(false);
    }
  });

  it("keeps the use case free of adapters, processes and the filesystem", () => {
    expect(violations("usecases", BANNED)).toEqual([]);
  });

  it("would catch a banned import", () => {
    expect(
      BANNED.some((re) => re.test("node:child_process")) &&
        BANNED.some((re) => re.test("../adapters/gh-issue-tracker")) &&
        BANNED.some((re) => re.test("node:fs/promises")),
    ).toBe(true);
  });
});

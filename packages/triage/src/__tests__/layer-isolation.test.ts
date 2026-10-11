import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
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

/** The plan module stays pure: no processes, no filesystem, no CLI. */
const BANNED = [
  /^(node:)?child_process$/,
  /^(node:)?fs(\/promises)?$/,
  /(^|\/)cli$/,
];

describe("layer isolation", () => {
  it("keeps the plan module free of processes, the filesystem and the CLI", () => {
    const violations = sourceFiles(join(SRC, "plan")).flatMap((file) =>
      importsOf(file)
        .filter((spec) => BANNED.some((re) => re.test(spec)))
        .map((spec) => `${relative(SRC, file)} imports ${spec}`),
    );
    expect(violations).toEqual([]);
  });

  it.each(["node:child_process", "fs", "node:fs/promises", "../cli"])(
    "would catch %s",
    (spec) => {
      expect(BANNED.some((re) => re.test(spec))).toBe(true);
    },
  );
});

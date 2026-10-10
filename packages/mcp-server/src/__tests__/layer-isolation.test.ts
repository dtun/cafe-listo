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
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function violations(dir: string, banned: RegExp[]): string[] {
  return sourceFiles(join(SRC, dir)).flatMap((file) =>
    importsOf(file)
      .filter((spec) => banned.some((re) => re.test(spec)))
      .map((spec) => `${relative(SRC, file)} imports ${spec}`),
  );
}

describe("layer isolation", () => {
  it("keeps use cases free of frameworks, validation, and adapters", () => {
    expect(
      violations("usecases", [/^hono/, /^@supabase\//, /^zod/, /adapters\//]),
    ).toEqual([]);
  });

  it("keeps routes and MCP wiring away from adapters and the DB client", () => {
    const banned = [/^@supabase\//, /adapters\//];
    expect([
      ...violations("routes", banned),
      ...violations("mcp", banned),
    ]).toEqual([]);
  });
});

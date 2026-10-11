import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checklistEntryColumns,
  feedbackColumns,
  householdProfileColumns,
  oauthClientColumns,
  oauthCodeColumns,
} from "../database.types";

const MIGRATIONS = join(
  import.meta.dirname,
  "../../../../../../supabase/migrations",
);

/** Collects column names for a table from CREATE TABLE and ALTER TABLE ... ADD COLUMN statements. */
function migrationColumns(table: string): string[] {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const columns = new Set<string>();

  const create = new RegExp(
    `create table (?:if not exists )?public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
    "i",
  ).exec(sql);
  for (const line of create?.[1].split("\n") ?? []) {
    const name = /^\s*([a-z_]+)\s+[a-z]/i.exec(line)?.[1];
    if (name && !/^(primary|unique|constraint|check|foreign)$/i.test(name)) {
      columns.add(name);
    }
  }
  const add = new RegExp(
    `alter table public\\.${table}\\s+add column (?:if not exists )?([a-z_]+)`,
    "gi",
  );
  for (const match of sql.matchAll(add)) columns.add(match[1]);

  return [...columns].sort();
}

describe("schema drift", () => {
  it("checklist_entries row type matches the migrations", () => {
    expect([...checklistEntryColumns].sort()).toEqual(
      migrationColumns("checklist_entries"),
    );
  });

  it("feedback row type matches the migrations", () => {
    expect([...feedbackColumns].sort()).toEqual(migrationColumns("feedback"));
  });

  it("household_profiles row type matches the migrations", () => {
    expect([...householdProfileColumns].sort()).toEqual(
      migrationColumns("household_profiles"),
    );
  });

  it("oauth_clients row type matches the migrations", () => {
    expect([...oauthClientColumns].sort()).toEqual(
      migrationColumns("oauth_clients"),
    );
  });

  it("oauth_codes row type matches the migrations", () => {
    expect([...oauthCodeColumns].sort()).toEqual(
      migrationColumns("oauth_codes"),
    );
  });
});

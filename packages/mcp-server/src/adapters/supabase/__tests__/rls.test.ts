import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(
  import.meta.dirname,
  "../../../../../../supabase/migrations",
);

const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n")
  // Drop comments so commented-out statements don't count.
  .replace(/--.*$/gm, "");

const tables = [
  ...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi),
].map((m) => m[1]);

/** RLS is the only thing keeping users' rows apart, so its presence is asserted from the migrations. */
describe("row level security", () => {
  it("finds the tables", () => {
    expect(tables).toEqual(
      expect.arrayContaining([
        "checklist_entries",
        "oauth_clients",
        "oauth_codes",
      ]),
    );
  });

  it.each(tables)("public.%s has row level security enabled", (table) => {
    expect(sql).toMatch(
      new RegExp(
        `alter table public\\.${table}\\s+enable row level security`,
        "i",
      ),
    );
  });

  it("checklist_entries has a policy keyed on auth.uid() = user_id", () => {
    const policy = /create policy[^;]*?on public\.checklist_entries([^;]*);/i
      .exec(sql)?.[1]
      .replace(/\s+/g, " ");
    // Matches both `auth.uid() = user_id` and `(select auth.uid()) = user_id`.
    const ownRow = String.raw`\(\s*\(?\s*(?:select\s+)?auth\.uid\(\)\s*\)?\s*=\s*user_id\s*\)`;

    expect(policy).toBeDefined();
    expect(policy).toMatch(new RegExp(`using\\s*${ownRow}`, "i"));
    expect(policy).toMatch(new RegExp(`with check\\s*${ownRow}`, "i"));
  });
});

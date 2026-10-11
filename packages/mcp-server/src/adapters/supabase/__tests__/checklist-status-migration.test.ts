import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = join(
  import.meta.dirname,
  "../../../../../../supabase/migrations/20261011000100_add_checklist_entry_status.sql",
);

// Drop comments, then collapse whitespace so statements match on one line.
const sql = readFileSync(FILE, "utf8")
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ");

// Function bodies hold semicolons, so set them aside before splitting.
const statements = sql
  .replace(/\$\$.*?\$\$/g, "$$$$")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

function indexOfStatement(pattern: RegExp): number {
  return statements.findIndex((s) => pattern.test(s));
}

describe("checklist_entries status migration", () => {
  it("adds status, quantity, packed_at and expires_on, safe to run twice", () => {
    expect(sql).toMatch(
      /add column if not exists status text not null default 'needed' check \(status in \('needed', 'bought', 'packed'\)\)/i,
    );
    expect(sql).toMatch(
      /add column if not exists quantity integer check \(quantity >= 0\)/i,
    );
    expect(sql).toMatch(/add column if not exists packed_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists expires_on date/i);
  });

  describe("backfill", () => {
    const index = indexOfStatement(/^update public\.checklist_entries /i);
    const backfill = statements[index] ?? "";

    it("marks done rows packed, dated from their last update", () => {
      expect(backfill).toMatch(/set status = 'packed'/i);
      expect(backfill).toMatch(
        /packed_at = coalesce\(packed_at, updated_at\)/i,
      );
    });

    it("touches only done rows not already packed, so it can run twice", () => {
      expect(backfill).toMatch(/where done = true and status <> 'packed'$/i);
    });

    it("leaves quantity and expires_on null (unknown) for existing rows", () => {
      expect(backfill).not.toMatch(/quantity|expires_on/i);
    });

    it("runs after the status column exists and before the constraint", () => {
      const addStatus = indexOfStatement(/add column if not exists status/i);
      const addPackedAt = indexOfStatement(
        /add column if not exists packed_at/i,
      );
      const constraint = indexOfStatement(
        /add constraint checklist_entries_done_matches_status/i,
      );
      expect(index).toBeGreaterThan(addStatus);
      expect(index).toBeGreaterThan(addPackedAt);
      expect(constraint).toBeGreaterThan(index);
    });
  });

  describe("done stays in sync with status", () => {
    it("keeps done and requires it to match status", () => {
      expect(sql).not.toMatch(/drop column/i);
      expect(sql).toMatch(
        /add constraint checklist_entries_done_matches_status check \(done = \(status = 'packed'\)\)/i,
      );
      expect(sql).toMatch(
        /drop constraint if exists checklist_entries_done_matches_status/i,
      );
    });

    it("syncs with a before insert or update trigger", () => {
      expect(sql).toMatch(
        /drop trigger if exists sync_done on public\.checklist_entries/i,
      );
      expect(sql).toMatch(
        /create trigger sync_done before insert or update on public\.checklist_entries for each row execute function public\.checklist_entries_sync_done\(\)/i,
      );
    });

    it("maps legacy done-only writes to a status and derives done otherwise", () => {
      const fn =
        /create or replace function public\.checklist_entries_sync_done\(\)(.*?)\$\$(.*)\$\$/i.exec(
          sql,
        );
      expect(fn?.[1]).toMatch(/set search_path = ''/i);
      const body = fn?.[2] ?? "";
      expect(body).toMatch(
        /new\.status is not distinct from old\.status and new\.done is distinct from old\.done/i,
      );
      expect(body).toMatch(
        /new\.status := case when new\.done then 'packed' else 'needed' end/i,
      );
      expect(body).toMatch(
        /tg_op = 'INSERT' and new\.done and new\.status = 'needed'/i,
      );
      expect(body).toMatch(/new\.done := new\.status = 'packed'/i);
    });
  });
});

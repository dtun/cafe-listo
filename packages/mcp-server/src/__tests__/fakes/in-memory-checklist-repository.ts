import type { ChecklistEntry, ChecklistRepository } from "@cafe-listo/shared";

/** Mirrors the real table: one row per (user, item); saveEntries is an upsert. */
export class InMemoryChecklistRepository implements ChecklistRepository {
  private rows = new Map<string, Map<string, ChecklistEntry>>();
  /** Number of saveEntries calls, to check that batches are one write. */
  saves = 0;

  async getEntries(userId: string): Promise<ChecklistEntry[]> {
    return [...(this.rows.get(userId)?.values() ?? [])].map((e) =>
      structuredClone(e),
    );
  }

  async saveEntries(
    userId: string,
    entries: readonly ChecklistEntry[],
  ): Promise<void> {
    this.saves += 1;
    const userRows = this.rows.get(userId) ?? new Map();
    for (const entry of entries) {
      userRows.set(entry.itemId, structuredClone(entry));
    }
    this.rows.set(userId, userRows);
  }

  async reset(userId: string): Promise<void> {
    this.rows.delete(userId);
  }
}

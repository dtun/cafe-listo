import type { ChecklistEntry, ChecklistRepository } from "@cafe-listo/shared";

/** Mirrors the real table: one row per (user, item); setDone is an upsert. */
export class InMemoryChecklistRepository implements ChecklistRepository {
  private rows = new Map<string, Map<string, ChecklistEntry>>();

  async getEntries(userId: string): Promise<ChecklistEntry[]> {
    return [...(this.rows.get(userId)?.values() ?? [])].map((e) => ({ ...e }));
  }

  async setDone(
    userId: string,
    itemId: string,
    done: boolean,
    at: Date,
  ): Promise<void> {
    const userRows = this.rows.get(userId) ?? new Map();
    userRows.set(itemId, { itemId, done, updatedAt: at });
    this.rows.set(userId, userRows);
  }

  async reset(userId: string): Promise<void> {
    this.rows.delete(userId);
  }
}

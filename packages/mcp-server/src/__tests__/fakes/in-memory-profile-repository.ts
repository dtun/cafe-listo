import type { HouseholdProfile, ProfileRepository } from "@cafe-listo/shared";

/** Mirrors the real table: one profile per user; save is an upsert. */
export class InMemoryProfileRepository implements ProfileRepository {
  private rows = new Map<string, HouseholdProfile>();

  async get(userId: string): Promise<HouseholdProfile | null> {
    const row = this.rows.get(userId);
    return row ? structuredClone(row) : null;
  }

  async save(userId: string, profile: HouseholdProfile): Promise<void> {
    this.rows.set(userId, structuredClone(profile));
  }
}

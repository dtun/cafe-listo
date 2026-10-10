/** A user's stored state for one catalog item. Items without an entry are not packed. */
export interface ChecklistEntry {
  itemId: string;
  done: boolean;
  updatedAt: Date;
}

/** Persistence port for per-user checklists. Every operation is scoped to one user. */
export interface ChecklistRepository {
  getEntries(userId: string): Promise<ChecklistEntry[]>;
  /** Upsert: setting the same value twice is a no-op. */
  setDone(
    userId: string,
    itemId: string,
    done: boolean,
    at: Date,
  ): Promise<void>;
  reset(userId: string): Promise<void>;
}

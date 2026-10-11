import {
  ITEM_STATUSES,
  RepositoryError,
  type ChecklistEntry,
  type ChecklistRepository,
} from "@cafe-listo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ChecklistEntryRow, Database } from "./database.types";
import { toRepositoryError } from "./errors";

const COLUMNS = "item_id, status, quantity, packed_at, expires_on, updated_at";

const rowSchema = z.object({
  item_id: z.string(),
  status: z.enum(ITEM_STATUSES),
  quantity: z.number().int().min(0).nullable(),
  packed_at: z.iso.datetime({ offset: true }).nullable(),
  expires_on: z.iso.date().nullable(),
  updated_at: z.iso.datetime({ offset: true }),
});

function rowToEntry(row: unknown): ChecklistEntry {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) {
    throw new RepositoryError(
      "INVALID_ROW",
      `checklist_entries row failed validation: ${parsed.error.message}`,
    );
  }
  const r = parsed.data;
  return {
    itemId: r.item_id,
    status: r.status,
    quantity: r.quantity,
    packedAt: r.packed_at ? new Date(r.packed_at) : null,
    expiresOn: r.expires_on,
    updatedAt: new Date(r.updated_at),
  };
}

function entryToRow(userId: string, entry: ChecklistEntry): ChecklistEntryRow {
  return {
    user_id: userId,
    item_id: entry.itemId,
    // The trigger derives this too; writing it keeps each row consistent on its own.
    done: entry.status === "packed",
    status: entry.status,
    quantity: entry.quantity,
    packed_at: entry.packedAt?.toISOString() ?? null,
    expires_on: entry.expiresOn,
    updated_at: entry.updatedAt.toISOString(),
  };
}

export class SupabaseChecklistRepository implements ChecklistRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getEntries(userId: string): Promise<ChecklistEntry[]> {
    const { data, error } = await this.client
      .from("checklist_entries")
      .select(COLUMNS)
      .eq("user_id", userId);
    if (error) throw toRepositoryError(error);
    return (data ?? []).map(rowToEntry);
  }

  async saveEntries(
    userId: string,
    entries: readonly ChecklistEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await this.client.from("checklist_entries").upsert(
      entries.map((entry) => entryToRow(userId, entry)),
      { onConflict: "user_id,item_id" },
    );
    if (error) throw toRepositoryError(error);
  }

  async reset(userId: string): Promise<void> {
    const { error } = await this.client
      .from("checklist_entries")
      .delete()
      .eq("user_id", userId);
    if (error) throw toRepositoryError(error);
  }
}

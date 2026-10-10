import {
  RepositoryError,
  type ChecklistEntry,
  type ChecklistRepository,
} from "@cafe-listo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { toRepositoryError } from "./errors";

const rowSchema = z.object({
  item_id: z.string(),
  done: z.boolean(),
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
  return {
    itemId: parsed.data.item_id,
    done: parsed.data.done,
    updatedAt: new Date(parsed.data.updated_at),
  };
}

export class SupabaseChecklistRepository implements ChecklistRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getEntries(userId: string): Promise<ChecklistEntry[]> {
    const { data, error } = await this.client
      .from("checklist_entries")
      .select("item_id, done, updated_at")
      .eq("user_id", userId);
    if (error) throw toRepositoryError(error);
    return (data ?? []).map(rowToEntry);
  }

  async setDone(
    userId: string,
    itemId: string,
    done: boolean,
    at: Date,
  ): Promise<void> {
    const { error } = await this.client.from("checklist_entries").upsert(
      {
        user_id: userId,
        item_id: itemId,
        done,
        updated_at: at.toISOString(),
      },
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

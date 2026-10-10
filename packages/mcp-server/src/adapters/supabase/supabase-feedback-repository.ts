import type { FeedbackRepository, NewFeedback } from "@cafe-listo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { toRepositoryError } from "./errors";

export class SupabaseFeedbackRepository implements FeedbackRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** Plain insert with no RETURNING: users have no SELECT on feedback, so reading the row back would fail RLS. */
  async insert(feedback: NewFeedback): Promise<void> {
    const { error } = await this.client.from("feedback").insert({
      id: feedback.id,
      user_id: feedback.userId,
      kind: feedback.kind,
      summary: feedback.summary,
      details: feedback.details ?? null,
      tool_name: feedback.toolName ?? null,
      item_id: feedback.itemId ?? null,
      user_quote: feedback.userQuote ?? null,
      created_at: feedback.createdAt.toISOString(),
    });
    if (error) throw toRepositoryError(error);
  }
}

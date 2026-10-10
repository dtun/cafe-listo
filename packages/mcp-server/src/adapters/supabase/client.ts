import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * A request-scoped client that acts as the caller: anon key plus their JWT,
 * so row-level security decides what they can read and write.
 */
export function createUserSupabaseClient(config: {
  url: string;
  anonKey: string;
  accessToken: string;
}): AppSupabaseClient {
  return createClient<Database>(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${config.accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

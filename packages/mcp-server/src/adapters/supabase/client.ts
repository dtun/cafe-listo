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

const SERVER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/** Anon-key client for Supabase Auth calls (sign-in, sign-up, refresh). */
export function createAnonSupabaseClient(config: {
  url: string;
  anonKey: string;
}): AppSupabaseClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: SERVER_AUTH_OPTIONS,
  });
}

/**
 * Service-role client. Bypasses RLS — only for the OAuth tables, never for
 * user data. Built once at the composition root.
 */
export function createServiceSupabaseClient(config: {
  url: string;
  serviceRoleKey: string;
}): AppSupabaseClient {
  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: SERVER_AUTH_OPTIONS,
  });
}

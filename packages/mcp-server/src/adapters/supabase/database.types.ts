/**
 * Hand-maintained to match supabase/migrations (schema-drift.test.ts enforces
 * the column list). Replace with `supabase gen types typescript --local` output
 * once a local Supabase stack is part of the workflow.
 */
// A type alias, not an interface: supabase-js needs rows assignable to Record<string, unknown>.
export type ChecklistEntryRow = {
  user_id: string;
  item_id: string;
  /** Kept equal to `status === "packed"` by a trigger; see the status migration. */
  done: boolean;
  status: "needed" | "bought" | "packed";
  quantity: number | null;
  packed_at: string | null;
  /** A Postgres `date`: `YYYY-MM-DD`. */
  expires_on: string | null;
  updated_at: string;
};

export const checklistEntryColumns = [
  "user_id",
  "item_id",
  "done",
  "status",
  "quantity",
  "packed_at",
  "expires_on",
  "updated_at",
] as const satisfies readonly (keyof ChecklistEntryRow)[];

export type FeedbackRow = {
  id: string;
  user_id: string;
  kind: string;
  summary: string;
  details: string | null;
  tool_name: string | null;
  item_id: string | null;
  user_quote: string | null;
  client_name: string | null;
  created_at: string;
};

export const feedbackColumns = [
  "id",
  "user_id",
  "kind",
  "summary",
  "details",
  "tool_name",
  "item_id",
  "user_quote",
  "client_name",
  "created_at",
] as const satisfies readonly (keyof FeedbackRow)[];

export type OAuthClientRow = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
};

export const oauthClientColumns = [
  "client_id",
  "client_name",
  "redirect_uris",
  "created_at",
] as const satisfies readonly (keyof OAuthClientRow)[];

export type OAuthCodeRow = {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  refresh_token: string;
  expires_at: string;
};

export const oauthCodeColumns = [
  "code_hash",
  "client_id",
  "user_id",
  "redirect_uri",
  "code_challenge",
  "refresh_token",
  "expires_at",
] as const satisfies readonly (keyof OAuthCodeRow)[];

/** A Postgres `json`/`jsonb` value. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type HouseholdProfileRow = {
  user_id: string;
  region: number;
  state: string;
  zip: string | null;
  household: Json;
  updated_at: string;
};

export const householdProfileColumns = [
  "user_id",
  "region",
  "state",
  "zip",
  "household",
  "updated_at",
] as const satisfies readonly (keyof HouseholdProfileRow)[];

export type Database = {
  public: {
    Tables: {
      checklist_entries: {
        Row: ChecklistEntryRow;
        Insert: Pick<ChecklistEntryRow, "user_id" | "item_id"> &
          Partial<Omit<ChecklistEntryRow, "user_id" | "item_id">>;
        Update: Partial<ChecklistEntryRow>;
        Relationships: [];
      };
      feedback: {
        Row: FeedbackRow;
        Insert: Pick<FeedbackRow, "user_id" | "kind" | "summary"> &
          Partial<Omit<FeedbackRow, "user_id" | "kind" | "summary">>;
        Update: Partial<FeedbackRow>;
        Relationships: [];
      };
      household_profiles: {
        Row: HouseholdProfileRow;
        Insert: Omit<HouseholdProfileRow, "zip" | "updated_at"> &
          Partial<Pick<HouseholdProfileRow, "zip" | "updated_at">>;
        Update: Partial<HouseholdProfileRow>;
        Relationships: [];
      };
      oauth_clients: {
        Row: OAuthClientRow;
        Insert: Omit<OAuthClientRow, "created_at"> &
          Partial<Pick<OAuthClientRow, "created_at">>;
        Update: Partial<OAuthClientRow>;
        Relationships: [];
      };
      oauth_codes: {
        Row: OAuthCodeRow;
        Insert: OAuthCodeRow;
        Update: Partial<OAuthCodeRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

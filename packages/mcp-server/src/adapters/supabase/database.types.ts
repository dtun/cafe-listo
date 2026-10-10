/**
 * Hand-maintained to match supabase/migrations (schema-drift.test.ts enforces
 * the column list). Replace with `supabase gen types typescript --local` output
 * once a local Supabase stack is part of the workflow.
 */
// A type alias, not an interface: supabase-js needs rows assignable to Record<string, unknown>.
export type ChecklistEntryRow = {
  user_id: string;
  item_id: string;
  done: boolean;
  updated_at: string;
};

export const checklistEntryColumns = [
  "user_id",
  "item_id",
  "done",
  "updated_at",
] as const satisfies readonly (keyof ChecklistEntryRow)[];

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

export type Database = {
  public: {
    Tables: {
      checklist_entries: {
        Row: ChecklistEntryRow;
        Insert: Omit<ChecklistEntryRow, "done" | "updated_at"> &
          Partial<Pick<ChecklistEntryRow, "done" | "updated_at">>;
        Update: Partial<ChecklistEntryRow>;
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

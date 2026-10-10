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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

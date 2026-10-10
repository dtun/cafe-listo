-- Explicit table privileges instead of relying on Supabase's default grants,
-- which a project may have turned off (automatic Data API exposure).

-- Signed-in users reach checklist_entries through the Data API; RLS limits them to their own rows.
grant select, insert, update, delete on public.checklist_entries to authenticated;
revoke all on public.checklist_entries from anon;

-- OAuth server state is service-role only.
revoke all on public.oauth_clients, public.oauth_codes from anon, authenticated;

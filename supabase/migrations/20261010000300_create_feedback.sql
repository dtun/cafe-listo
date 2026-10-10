-- Feedback the assistant submits on a user's behalf, with their consent.
-- Write-only for users: they may insert their own rows but never read,
-- change, or delete them (there are no SELECT/UPDATE/DELETE policies).
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('gap', 'bug', 'content_error', 'idea', 'other')),
  summary text not null check (char_length(summary) between 1 and 500),
  details text check (char_length(details) <= 4000),
  tool_name text check (char_length(tool_name) <= 100),
  item_id text check (char_length(item_id) <= 100),
  user_quote text check (char_length(user_quote) <= 1000),
  client_name text check (char_length(client_name) <= 200),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- The server forwards the caller's JWT, so RLS is the enforcement point.
drop policy if exists "insert own feedback" on public.feedback;
create policy "insert own feedback" on public.feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Explicit privileges: signed-in users may only insert; anon gets nothing.
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;

create index if not exists feedback_created_at_idx on public.feedback (created_at);

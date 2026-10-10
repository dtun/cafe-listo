-- Per-user checklist state. The item catalog is static in @cafe-listo/shared,
-- so item_id is validated by the application, not a foreign key.
create table if not exists public.checklist_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.checklist_entries enable row level security;

-- The server forwards the caller's JWT, so RLS is the enforcement point.
drop policy if exists "own rows" on public.checklist_entries;
create policy "own rows" on public.checklist_entries
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

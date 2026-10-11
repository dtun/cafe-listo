-- One household profile per user: where they live and who they prep for.
-- Location is state and five-digit ZIP only, never a street address or
-- ZIP+4. The region is derived from them by the application (FEMA regions
-- live in @cafe-listo/shared), so it is not a foreign key.
create table if not exists public.household_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  region smallint not null check (region between 1 and 10),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}$'),
  household jsonb not null check (jsonb_typeof(household) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.household_profiles enable row level security;

-- The server forwards the caller's JWT, so RLS is the enforcement point.
drop policy if exists "own rows" on public.household_profiles;
create policy "own rows" on public.household_profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Explicit privileges: signed-in users reach their own row through the Data
-- API (RLS limits them to it); anon gets nothing.
revoke all on public.household_profiles from anon, authenticated;
grant select, insert, update, delete on public.household_profiles to authenticated;

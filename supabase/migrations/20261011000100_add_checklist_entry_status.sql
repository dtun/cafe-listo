-- Track each item through needed -> bought -> packed, with how many units
-- the user has, when it was packed and when it expires.
--
-- `done` stays, kept equal to (status = 'packed') by the trigger below:
-- - Migrations only move forward, and dropping a column loses data for good.
-- - Migrations are applied by hand before the deploy, so for a while the old
--   server still writes `done` alone. The trigger turns those writes into a
--   status, so old and new servers can't disagree.
-- A later migration can drop `done` once nothing writes it.
alter table public.checklist_entries
  add column if not exists status text not null default 'needed'
    check (status in ('needed', 'bought', 'packed'));

-- Purchase units the user has; null means "not recorded", read as the full
-- planned amount.
alter table public.checklist_entries
  add column if not exists quantity integer check (quantity >= 0);

alter table public.checklist_entries
  add column if not exists packed_at timestamptz;

-- From the label, when the user gives it. Null means unknown.
alter table public.checklist_entries
  add column if not exists expires_on date;

-- Backfill: every item already marked done is packed. Its last update is the
-- best guess at when it was packed. Rows that are not done keep 'needed'.
update public.checklist_entries
  set status = 'packed',
      packed_at = coalesce(packed_at, updated_at)
  where done = true and status <> 'packed';

-- Keeps `done` and `status` in step whichever one a writer sets.
create or replace function public.checklist_entries_sync_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.done is distinct from old.done then
    -- A legacy write: only `done` changed.
    new.status := case when new.done then 'packed' else 'needed' end;
    new.packed_at := case when new.done then coalesce(new.packed_at, now()) end;
  elsif tg_op = 'INSERT' and new.done and new.status = 'needed' then
    -- A legacy insert: `done` set, `status` left at its default.
    new.status := 'packed';
    new.packed_at := coalesce(new.packed_at, now());
  else
    new.done := new.status = 'packed';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_done on public.checklist_entries;
create trigger sync_done
  before insert or update on public.checklist_entries
  for each row execute function public.checklist_entries_sync_done();

alter table public.checklist_entries
  drop constraint if exists checklist_entries_done_matches_status;
alter table public.checklist_entries
  add constraint checklist_entries_done_matches_status
    check (done = (status = 'packed'));

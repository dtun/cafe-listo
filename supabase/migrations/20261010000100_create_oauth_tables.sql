-- OAuth 2.1 authorization server state for remote MCP clients.
-- RLS is on with no policies: only the server's service-role client can touch these.

create table if not exists public.oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;

-- Single-use authorization codes. Only a SHA-256 hash of the code is stored,
-- and the row is deleted when exchanged.
create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);

alter table public.oauth_codes enable row level security;

create index if not exists oauth_codes_expires_at_idx on public.oauth_codes (expires_at);

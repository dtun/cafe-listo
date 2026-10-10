# Cafe Listo MCP server

`packages/mcp-server` is a remote [MCP](https://modelcontextprotocol.io) server. Claude and other MCP clients use it to read the prep box catalog and to read and update a signed-in user's checklist.

- **Transport:** Streamable HTTP at `POST /mcp`. It is stateless and returns JSON responses.
- **Auth:** OAuth 2.1. Clients register themselves dynamically and use PKCE (S256). Users sign in with Supabase Auth, and the access token a client receives is the user's Supabase JWT.
- **Storage:** Supabase Postgres.
  - `checklist_entries` is protected by RLS. The server forwards the caller's JWT, so Postgres decides which rows they can see.
  - `oauth_clients` and `oauth_codes` are reachable only with the service role.
- **Hosting:** Railway, configured by `packages/mcp-server/railway.json`.

## Tools

| Tool              | Mutates | Purpose                                                      |
| ----------------- | ------- | ------------------------------------------------------------ |
| `list_categories` | no      | Category ids, labels, emoji                                  |
| `list_items`      | no      | Catalog items, filterable by category or essential only      |
| `get_checklist`   | no      | The user's done state plus overall and per-category progress |
| `set_item_done`   | yes     | Mark one item packed or not packed (idempotent)              |
| `reset_checklist` | yes     | Clear the user's checklist                                   |

Tool definitions live in `packages/shared/src/mcp/tool-registry.ts`.

## Connect a client

**Claude (web/desktop):** go to Settings → Connectors → Add custom connector, and enter `https://<host>/mcp`. Claude registers itself, sends you to the Cafe Listo sign-in page, and connects once you sign in.

**Claude Code:**

```sh
claude mcp add --transport http cafe-listo https://<host>/mcp
```

Then run `/mcp` in Claude Code to authenticate.

## Endpoints

| Path                                              | Purpose                                          |
| ------------------------------------------------- | ------------------------------------------------ |
| `GET /health`                                     | Liveness. Needs no config.                       |
| `POST /mcp`                                       | MCP (Bearer token required)                      |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 resource metadata                       |
| `GET /.well-known/oauth-authorization-server`     | RFC 8414 authorization server metadata           |
| `POST /register`                                  | RFC 7591 dynamic client registration             |
| `GET /authorize`                                  | Starts the PKCE flow and shows sign-in           |
| `POST /login`                                     | Signs in or signs up, then redirects with a code |
| `POST /token`                                     | `authorization_code` and `refresh_token` grants  |

## Local development

Prerequisites: Node 22 (`.nvmrc`), pnpm 10, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```sh
supabase start                  # local Postgres + Auth in Docker; prints URL and keys
supabase db reset               # apply supabase/migrations
cp packages/mcp-server/.env.example packages/mcp-server/.env
# fill SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from `supabase status`
pnpm --filter @cafe-listo/mcp-server dev
```

Create a migration with `supabase migration new <verb_noun>`. Migrations only move forward. Write additive changes so they can run twice (`if not exists`), and update `src/adapters/supabase/database.types.ts`. The schema drift test fails if the two disagree.

### Smoke test

```sh
curl -s localhost:3000/health

# 401 with WWW-Authenticate pointing at the resource metadata
curl -si -X POST localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# With a user's access token:
curl -s -X POST localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploying to Railway

The service builds from the repo root so the pnpm workspace resolves. tsup inlines `@cafe-listo/shared` into `dist/index.js`, and production runs plain `node`.

1. Create the service from this repo. Set **Settings → Config-as-Code Path** to `packages/mcp-server/railway.json`.
2. Set these variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optionally set `PUBLIC_BASE_URL` (for a custom domain) and `SUPABASE_JWT_SECRET` (only for legacy HS256 projects).
3. Apply migrations by hand: `supabase link --project-ref <ref> && supabase db push`. CI does not run migrations.
4. In Supabase Auth settings, choose whether sign-up requires email confirmation. If it does, new users confirm their email and then sign in from the consent page.
5. Check that `/health` returns 200 and that `/.well-known/oauth-authorization-server` advertises `https://` URLs.

Things to know:

- If any required variable is missing, the server logs `config_incomplete` and leaves `/mcp` unmounted, but `/health` still passes. Look for that log line if `/mcp` returns 404.
- TLS ends at Railway's proxy. The public URL is built from `X-Forwarded-Proto` and `X-Forwarded-Host`. Set `PUBLIC_BASE_URL` if a proxy in front of Railway changes those headers.
- `.railwayignore` can't exclude workspace packages such as mobile or landing, because `pnpm install --frozen-lockfile` needs every workspace manifest listed in the lockfile.

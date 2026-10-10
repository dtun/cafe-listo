# Cafe Listo MCP server

`packages/mcp-server` is a remote [MCP](https://modelcontextprotocol.io) server. Claude and other MCP clients use it to read the prep box catalog and to read and update a signed-in user's checklist.

- **Transport:** Streamable HTTP at `POST /mcp`. It is stateless and returns JSON responses. `GET` and `DELETE /mcp` return `405` with `Allow: POST`, because there is no standalone SSE stream and there are no sessions.
- **Auth:** OAuth 2.1. Clients register themselves dynamically and use PKCE (S256). Users sign in with Supabase Auth, and the access token a client receives is the user's Supabase JWT.
- **Storage:** Supabase Postgres.
  - `checklist_entries` is protected by RLS. The server forwards the caller's JWT, so Postgres decides which rows they can see.
  - `feedback` is write-only for users: RLS lets them insert their own rows and nothing else. Read it with the service role or the Supabase dashboard.
  - `oauth_clients` and `oauth_codes` are reachable only with the service role.
- **Hosting:** Railway, configured by `railway.json` at the repo root.

## Tools

| Tool              | Mutates | Purpose                                                      |
| ----------------- | ------- | ------------------------------------------------------------ |
| `list_categories` | no      | Category ids, labels, emoji                                  |
| `list_items`      | no      | Catalog items, filterable by category or essential only      |
| `get_checklist`   | no      | The user's done state plus overall and per-category progress |
| `set_item_done`   | yes     | Mark one item packed or not packed (idempotent)              |
| `reset_checklist` | yes     | Clear the user's checklist                                   |
| `submit_feedback` | yes     | Send a gap, bug, content error, or idea (after user consent) |

Tool definitions live in `packages/shared/src/mcp/tool-registry.ts`. `tools/list` sends each tool's `title` and MCP `annotations`: read-only tools get `readOnlyHint: true`, `set_item_done` is idempotent, `reset_checklist` is idempotent and destructive, and `submit_feedback` is neither. The `initialize` result includes `instructions` telling the assistant when to offer feedback. Each submission logs `feedback_submitted` with its id and kind, never the text.

## Connect a client

**Claude (web/desktop):** go to Settings → Connectors → Add custom connector, and enter `https://<host>/mcp`. Claude registers itself, sends you to the Cafe Listo sign-in page, and connects once you sign in.

**Claude Code:**

```sh
claude mcp add --transport http cafe-listo https://<host>/mcp
```

Then run `/mcp` in Claude Code to authenticate.

## Endpoints

| Path                                              | Purpose                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `GET /health`                                     | Liveness. Needs no config.                        |
| `GET /ready`                                      | Readiness: 503 until `/mcp` and OAuth are mounted |
| `POST /mcp`                                       | MCP (Bearer token required)                       |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 resource metadata                        |
| `GET /.well-known/oauth-authorization-server`     | RFC 8414 authorization server metadata            |
| `POST /register`                                  | RFC 7591 dynamic client registration              |
| `GET /authorize`                                  | Starts the PKCE flow and shows sign-in            |
| `POST /login`                                     | Signs in or signs up, then redirects with a code  |
| `POST /token`                                     | `authorization_code` and `refresh_token` grants   |

`POST /login`, `/register`, and `/token` are rate limited per client IP (the first `X-Forwarded-For` entry): login 10 per minute, register 10 per hour, token 60 per minute. The limits live in `OAUTH_RATE_LIMITS` in `src/routes/oauth.ts`. Counters are in memory, so they reset on restart and are not shared between replicas. Over the limit, `/token` and `/register` return a `429` OAuth error and `/login` returns an error page, each with `Retry-After`. Keep Supabase Auth's own rate limits at or above these.

The sign-in page shows the host the user will be sent back to next to the client name, because anyone can register a client with any name. It cannot be framed (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).

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
curl -s localhost:3000/ready    # 503 until the Supabase config is complete

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

The service builds from the repo root so the pnpm workspace resolves. tsup inlines `@cafe-listo/shared` into `dist/index.js`, and production runs `node --enable-source-maps`.

Railway reads `railway.json` from the repo root automatically, so no Config-as-Code Path setting is needed. It builds with `pnpm --filter @cafe-listo/mcp-server... build`, starts `node --enable-source-maps packages/mcp-server/dist/index.js`, and uses `/ready` as the deploy healthcheck. Changes under `packages/mcp-server/`, `packages/shared/`, or to the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, or `railway.json` trigger a redeploy. Railpack takes Node from `engines.node` (`22.x`) and pnpm from `packageManager` in the root `package.json`.

1. Create the service from this repo. If an earlier setup set **Settings → Config-as-Code Path** to `packages/mcp-server/railway.json`, clear it.
2. Set the required variables:

   | Variable                    | Required     | Notes                                                                   |
   | --------------------------- | ------------ | ----------------------------------------------------------------------- |
   | `SUPABASE_URL`              | yes          | Project URL                                                             |
   | `SUPABASE_ANON_KEY`         | yes          | Used for sign-in and for user-scoped queries (RLS)                      |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes          | Used only for the OAuth client and code tables                          |
   | `PUBLIC_BASE_URL`           | yes, in prod | Absolute `https://` origin with no path, e.g. `https://mcp.example.com` |
   | `SUPABASE_JWT_SECRET`       | no           | Only for projects still signing with the legacy HS256 secret            |

3. Apply migrations by hand: `supabase link --project-ref <ref> && supabase db push`. CI does not run migrations.
4. In Supabase Auth settings, choose whether sign-up requires email confirmation. If it does, new users confirm their email and then sign in from the consent page.
5. Check that `/ready` returns 200 and that `/.well-known/oauth-authorization-server` advertises `https://` URLs.

Things to know:

- `/health` is liveness only and needs no config. `/ready` returns 503 until `/mcp` and the OAuth routes are mounted, so a deploy with missing or malformed variables fails its healthcheck and never replaces a working one. Look for `config_incomplete` or `config_invalid` in the logs.
- A set but malformed `PUBLIC_BASE_URL` (not an absolute http(s) origin) counts as misconfigured: `/mcp` stays unmounted and `/ready` fails.
- TLS ends at Railway's proxy. Without `PUBLIC_BASE_URL`, the public URL is built from the client-supplied `X-Forwarded-Proto` and `X-Forwarded-Host`, which is why production sets it.
- Rejected access tokens log `token_rejected` with a reason (`expired`, `bad_signature`, `wrong_issuer`, `wrong_audience`, `malformed`, `hs256_not_configured`, `jwks_fetch_failed`, ...). JWKS fetch failures log at error level. Tokens are never logged.
- `save()` on the authorization code store also deletes expired codes, since each one holds a live refresh token.
- `.railwayignore` can't exclude workspace packages such as mobile or landing, because `pnpm install --frozen-lockfile` needs every workspace manifest listed in the lockfile.

## Known limitations

- **No resource-bound tokens.** `/mcp` accepts any valid access token from the Supabase project (`aud: "authenticated"`), not only tokens issued for this server. There is no RFC 8707 audience binding. That is fine while the Supabase project backs only this server. If another app starts using the same project, mint resource-bound tokens or move this server to its own project.
- Rate-limit counters live in memory on one instance.

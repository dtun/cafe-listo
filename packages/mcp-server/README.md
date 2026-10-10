# @cafe-listo/mcp-server

Remote MCP server for Café Listo. Any MCP-capable assistant can use it to read the checklist catalog and to read and update a signed-in user's checklist. Hono on Node 22, Supabase Postgres with RLS, OAuth 2.1 with PKCE, deployed on Railway.

Setup, client connection, local development and deployment: [docs/mcp-setup.md](../../docs/mcp-setup.md).

## Architecture

Hexagonal, with dependencies pointing inward:

- **Ports:** `ChecklistRepository` in `packages/shared/src/checklist/ports.ts`; OAuth client, code and identity ports in `src/usecases/oauth/ports.ts`.
- **Use cases:** `src/usecases/` (`list-categories`, `list-items`, `get-checklist`, `set-item-done`, `reset-checklist`, `oauth/`). They depend only on ports.
- **Adapters:** `src/adapters/supabase/` implements the ports. HTTP routes live in `src/routes/`, and the MCP tool dispatch in `src/mcp/`.
- **Composition root:** `src/container.ts` wires adapters into use cases, with no DI library. `src/index.ts` reads config and starts the server; `src/app.ts` builds the Hono app.

## Endpoints

| Path                                              | Purpose                                                         |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `GET /health`                                     | Liveness. Needs no config.                                      |
| `GET /ready`                                      | Readiness and Railway healthcheck: 503 until config is set      |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 protected resource metadata                            |
| `GET /.well-known/oauth-authorization-server`     | RFC 8414 authorization server metadata                          |
| `POST /register`                                  | RFC 7591 dynamic client registration (rate limited)             |
| `GET /authorize`                                  | Starts the PKCE flow and shows the sign-in page                 |
| `POST /login`                                     | Signs in or signs up, then redirects with a code (rate limited) |
| `POST /token`                                     | `authorization_code` and `refresh_token` grants (rate limited)  |
| `POST /mcp`                                       | Stateless Streamable HTTP MCP endpoint (Bearer token)           |

## Tools

Defined in `packages/shared/src/mcp/tool-registry.ts`.

| Tool              | Mutates | Purpose                                                      |
| ----------------- | ------- | ------------------------------------------------------------ |
| `list_categories` | no      | Category ids, labels and emoji                               |
| `list_items`      | no      | Catalog items, optionally filtered by category or essentials |
| `get_checklist`   | no      | The user's done state plus overall and per-category progress |
| `set_item_done`   | yes     | Mark one item packed or not packed (idempotent)              |
| `reset_checklist` | yes     | Clear the user's checklist (destructive)                     |

## Environment

From `.env.example`. `pnpm dev` loads `packages/mcp-server/.env` if it exists.

| Variable                    | Required      | Notes                                                                                          |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `PORT`                      | no            | Defaults to 3000; Railway injects it                                                           |
| `SUPABASE_URL`              | yes           | Local: from `supabase status`                                                                  |
| `SUPABASE_ANON_KEY`         | yes           |                                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | yes           | Used only for the OAuth client and code tables, never for user data                            |
| `SUPABASE_JWT_SECRET`       | no            | Only for projects still signing JWTs with the legacy HS256 secret                              |
| `PUBLIC_BASE_URL`           | in production | Public origin, e.g. `https://mcp.example.com`; derived from forwarded headers locally if unset |

Until the required variables are set and valid, `/mcp` and the OAuth routes stay unmounted and `/ready` returns 503.

## Scripts

Run from this directory, or from the repo root with `pnpm --filter @cafe-listo/mcp-server <script>`.

| Script           | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | `tsx watch` with `.env` if present |
| `pnpm build`     | Bundle to `dist/` with tsup        |
| `pnpm start`     | Run `dist/index.js`                |
| `pnpm test`      | Vitest                             |
| `pnpm typecheck` | `tsc --noEmit`                     |

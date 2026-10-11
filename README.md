# Café Listo

Emergency preparedness checklist. The item catalog in `packages/shared` covers eight categories (water, food, medical, shelter, tools, comms, documents, morale); users mark items packed and see overall and per-category progress. It ships as a mobile app, a landing page, and a remote [MCP](https://modelcontextprotocol.io) server that lets MCP clients read and update a signed-in user's checklist.

## Packages

| Package               | What it is                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| `packages/shared`     | Types, seed data (categories and items), checklist ports, MCP tool registry |
| `packages/mobile`     | Expo 52 / React Native app with on-device storage                           |
| `packages/landing`    | Vite + React landing page                                                   |
| `packages/mcp-server` | Remote MCP server: Hono on Node 22, Supabase Postgres + RLS, OAuth 2.1      |
| `packages/triage`     | Weekly feedback triage loop: feedback in, validated plan, issues filed      |

## Setup

Requires Node 22 (`.nvmrc`) and pnpm (`packageManager` in `package.json`).

```sh
nvm use
pnpm install
```

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `pnpm test`         | Run all test suites                |
| `pnpm typecheck`    | `tsc --noEmit` across all packages |
| `pnpm lint`         | ESLint                             |
| `pnpm lint:fix`     | ESLint with auto-fix               |
| `pnpm format`       | Prettier write                     |
| `pnpm format:check` | Prettier check                     |

```sh
pnpm start                                    # mobile (expo start)
pnpm --filter @cafe-listo/mobile start        # also: ios, android, web
pnpm --filter @cafe-listo/landing dev         # also: build, preview
pnpm --filter @cafe-listo/mcp-server dev      # also: build, start
```

The MCP server needs a Supabase project (or a local stack via the Supabase CLI) and the variables in `packages/mcp-server/.env.example`; see [packages/mcp-server/README.md](packages/mcp-server/README.md). To connect a client, point it at `https://<host>/mcp`; details in [docs/mcp-setup.md](docs/mcp-setup.md).

## Repo layout

```
packages/       see table above
supabase/
  config.toml   local Supabase stack config
  migrations/   checklist, feedback and OAuth tables, RLS, grants
docs/
  mcp-setup.md  MCP server setup, endpoints, deployment
```

The Railway service's build, start and healthcheck are set on the service itself; `railway.json` is not honored by this project.

## Contributing

Use [Conventional Commits](https://www.conventionalcommits.org/). Tests live in `__tests__/` next to the source: Jest for `shared` and `mobile`, Vitest for `landing`, `mcp-server` and `triage`. Run `pnpm lint:fix` and `pnpm format` after changes and `pnpm typecheck` before committing; CI runs lint, typecheck and tests. Agent conventions are in [AGENTS.md](AGENTS.md).

## Roadmap

FEMA-region recommendations, household-scaled quantities and tote packing are planned in [#39](https://github.com/dtun/cafe-listo/issues/39).

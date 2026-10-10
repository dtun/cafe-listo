# Café Listo

An emergency preparedness checklist that gets your household ready ("listo" is Spanish for ready).

## What it does

Café Listo walks you through building an emergency kit from a curated checklist. The catalog lives in `packages/shared` and covers eight categories: water, food, medical, shelter, tools, comms, documents and morale. You mark items packed as you go and see progress overall and per category.

There are three ways to use it:

- **Mobile app:** an Expo / React Native app that keeps your checklist on the device.
- **Landing page:** a Vite + React site.
- **MCP server:** a remote [MCP](https://modelcontextprotocol.io) server that lets any MCP-capable AI assistant read and update your checklist after you sign in.

## Where it's headed

The goal ([#39](https://github.com/dtun/cafe-listo/issues/39)) is to go from one conversation with your assistant to one shopping list to a packed, FEMA-region-ready 27-gallon tote:

- **Your FEMA region is the guide.** Recommendations follow your region's hazards.
- **Customized to your family.** Quantities scale with who is in your household.
- **Complete tracking is peace of mind.** Every item is tracked until the tote is fully packed, so "am I ready?" has a real answer.

## Packages

| Package               | What it is                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `packages/shared`     | Types, seed data (categories and items), checklist ports, MCP tool registry     |
| `packages/mobile`     | Expo 52 / React Native app with on-device storage                               |
| `packages/landing`    | Vite + React landing page                                                       |
| `packages/mcp-server` | Remote MCP server: Hono on Node 22, Supabase Postgres + RLS, OAuth 2.1, Railway |

## Quick start

Requires Node 22 (pinned in `.nvmrc`) and pnpm (pinned via `packageManager` in `package.json`).

```sh
nvm use
pnpm install
```

Workspace scripts:

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `pnpm test`         | Run all test suites                |
| `pnpm typecheck`    | `tsc --noEmit` across all packages |
| `pnpm lint`         | ESLint                             |
| `pnpm lint:fix`     | ESLint with auto-fix               |
| `pnpm format`       | Prettier write                     |
| `pnpm format:check` | Prettier check                     |

Per-package dev commands:

```sh
pnpm start                                    # mobile: expo start (alias for the line below)
pnpm --filter @cafe-listo/mobile start        # also: ios, android, web
pnpm --filter @cafe-listo/landing dev         # Vite dev server; also: build, preview
pnpm --filter @cafe-listo/mcp-server dev      # tsx watch, loads .env if present; also: build, start
```

The MCP server needs a Supabase project (or a local stack via the Supabase CLI) and the variables in `packages/mcp-server/.env.example`. See [packages/mcp-server/README.md](packages/mcp-server/README.md).

## Connect an MCP client

Point any MCP client that supports remote servers at `https://<host>/mcp`. It registers itself over OAuth, sends you to the Café Listo sign-in page, and connects once you sign in. Setup, endpoints, local development and deployment are covered in [docs/mcp-setup.md](docs/mcp-setup.md).

## Repo layout

```
packages/
  shared/       types, seed data, ports, MCP tool registry
  mobile/       Expo app
  landing/      Vite site
  mcp-server/   remote MCP server
supabase/
  config.toml   local Supabase stack config
  migrations/   checklist and OAuth tables, RLS, grants
docs/
  mcp-setup.md  MCP server setup, endpoints and deployment
railway.json    Railway build and deploy config for the MCP server
```

## Contributing

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Tests live in `__tests__/` next to the source they cover: Jest for `shared` and `mobile`, Vitest for `landing` and `mcp-server`.
- After changing anything, run `pnpm lint:fix` and `pnpm format`, and run `pnpm typecheck` before committing. CI runs lint, typecheck and tests.
- See [AGENTS.md](AGENTS.md) for the conventions coding agents follow.

## Roadmap

Planned work is tracked in epic [#39](https://github.com/dtun/cafe-listo/issues/39).

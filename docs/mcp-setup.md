# Cafe Listo MCP server

`packages/mcp-server` is a remote [MCP](https://modelcontextprotocol.io) server. Claude and other MCP clients use it to read the prep box catalog and to read and update a signed-in user's checklist.

- **Transport:** Streamable HTTP at `POST /mcp`. It is stateless and returns JSON responses. `GET` and `DELETE /mcp` return `405` with `Allow: POST`, because there is no standalone SSE stream and there are no sessions.
- **Auth:** OAuth 2.1. Clients register themselves dynamically and use PKCE (S256). Users sign in with Supabase Auth, and the access token a client receives is the user's Supabase JWT.
- **Storage:** Supabase Postgres.
  - `checklist_entries` is protected by RLS. The server forwards the caller's JWT, so Postgres decides which rows they can see. Each row holds an item's `status` (`needed`, `bought` or `packed`), `quantity`, `packed_at` and `expires_on`; see [Tote progress](#tote-progress).
  - `household_profiles` holds one row per user: FEMA region, state, optional five-digit ZIP, and the household as jsonb. RLS limits users to their own row. Location is never finer than a ZIP.
  - `feedback` is write-only for users: RLS lets them insert their own rows and nothing else. Read it with the service role or the Supabase dashboard.
  - `oauth_clients` and `oauth_codes` are reachable only with the service role.
- **Hosting:** Railway. Build, start and healthcheck are set on the Railway service itself; `railway.json` is not honored by this project.

## Tools

| Tool                  | Mutates | Purpose                                                         |
| --------------------- | ------- | --------------------------------------------------------------- |
| `list_categories`     | no      | Category ids, labels, emoji                                     |
| `list_items`          | no      | Catalog items, filterable by category or essential only         |
| `get_checklist`       | no      | The user's done state plus overall and per-category progress    |
| `set_item_done`       | yes     | Mark one item packed or not packed (idempotent)                 |
| `reset_checklist`     | yes     | Clear the user's checklist                                      |
| `submit_feedback`     | yes     | Send a gap, bug, content error, or idea (after user consent)    |
| `get_household`       | no      | The user's location (state, ZIP, FEMA region) and household     |
| `set_household`       | yes     | Partially update the household; derives region from state/ZIP   |
| `get_tote`            | no      | Kit for the saved household with status, readiness, fit, expiry |
| `update_items`        | yes     | Batch status, quantity and label expiry updates                 |
| `build_shopping_list` | no      | What is left to buy, grouped by store, with fit and sources     |

Tool definitions live in `packages/shared/src/mcp/tool-registry.ts`. `tools/list` sends each tool's `title` and MCP `annotations`: read-only tools (including `get_tote` and `build_shopping_list`) get `readOnlyHint: true`, `set_item_done` is idempotent, `reset_checklist` is idempotent and destructive, `set_household` and `update_items` are idempotent and not destructive, and `submit_feedback` is neither. Every tool has `openWorldHint: false`, since each one touches only Cafe Listo's own data. `set_household` takes a state or a ZIP, derives the FEMA region, rejects an unknown or mismatched location with a hint to ask the user, and validates the merged household with the shared zod schema. The `initialize` result includes `instructions` that briefly describe the tools, ask the assistant to cite the sources `build_shopping_list` returns by title and URL (and only those), and say when to offer feedback. Each submission logs `feedback_submitted` with its id and kind, never the text.

## Tote progress

`get_tote` and `update_items` track the kit to 100%. The kit is `resolveKit` for the saved household profile, so `get_tote` returns an error telling the assistant to call `set_household` first when there is no profile.

**Status.** Each item moves `needed → bought → packed`; an item with no row is `needed`. `quantity` is how many purchase units the user has, and null means "not recorded". `packed_at` is set when an item moves to packed, kept while it stays packed, and cleared when it leaves, so repeating an update changes nothing. Moving an item back to `needed` clears its quantity unless one is sent. `update_items` writes a whole batch in one upsert and rejects the batch if any id is unknown or repeated. `set_item_done` is a shim: `done: true` means packed and `done: false` means needed.

**Readiness** is a whole number from 0 to 100, computed over every item in the resolved kit:

```
readiness = floor(100 × Σ wᵢ·pᵢ / Σ wᵢ)
wᵢ = 2 if the item is essential, else 1
pᵢ = 0                         unless the item is packed
pᵢ = min(1, quantityᵢ / unitsᵢ) when packed (a null quantity counts as unitsᵢ, so pᵢ = 1)
```

Bought items score 0, because only the tote counts as ready. The result is rounded down, so 100 means every item is fully packed. An empty kit scores 0. The code is `readinessPercent` in `packages/shared/src/tote/progress.ts`.

**Fit** is planned. `packTote` runs over the whole kit at its full `units` into the HDX 27 gal tote, whatever is packed so far. `planned_fill_percent` is how full the tote will be once everything is in, and `overflow` is what has to live beside it: items that are not packable, such as bulk water, and anything that runs out of room. Packed items are already in the tote and can't overflow, and readiness already measures progress, so fit answers the other question: will the whole kit fit?

**Expiring** lists bought or packed items that expire within 60 days or have already expired, soonest first. The date is `expires_on` from the label when the user gave it. Otherwise it is `packed_at` plus the item's `shelfLifeMonths`, clamped to the end of a short month, and marked `estimated: true`.

**Hazards** has one entry for each of the region's hazards. A hazard with kit items (`via: "items"`) is covered when all of those items are fully packed, and `missing` lists the rest. A hazard with no hazard-specific items (`via: "essentials"`) relies on the base kit, so it is covered when every essential base item is fully packed.

**The `done` column** stays, kept equal to `status = 'packed'` by a trigger, with a check constraint holding that invariant. Migrations only move forward, and dropping a column loses data for good. Migrations are also applied by hand before the deploy, so for a while the old server still writes `done` alone. The trigger turns those writes into a status, so the old and new servers can't disagree. The migration backfills `done = true` rows to `packed`, with `packed_at` set from `updated_at`. A later migration can drop `done` once nothing writes it.

## Shopping list

`build_shopping_list` is read-only. It loads the kit the same way `get_tote` does (the shared `loadTote` helper), so with no profile it returns the same error, asking the assistant to call `set_household` first and then `build_shopping_list` again. The rules are `buildShoppingList` in `packages/shared/src/shopping/shopping-list.ts`.

**Inputs**, all optional:

| Input              | Meaning                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `has_tote`         | Whether the user owns the tote. If omitted, it is inferred (see below).                                   |
| `store_preference` | `online`, `hardware`, `grocery`, `pharmacy` or `pet`. Every line, the tote included, goes in that group.  |
| `budget_mode`      | Essentials first. See below.                                                                              |
| `duration_days`    | 1 to 14. Sizes the list for that many days instead of the profile's. Not saved; the profile is unchanged. |

**What is left to buy.** For each kit item, the user has `quantity` purchase units if a quantity is recorded, whatever the status. Without one, a bought or packed item counts as complete (the same reading as readiness) and a needed item counts as none. The line asks for `units − have`, and items with nothing left count toward `counts.done`. Lines show `have` only when it is above 0, and `hazards` (the region hazards that brought the item in) only when there are any.

**Grouping.** Lines are grouped by the item's `buyAt`, or all by `store_preference`. Groups follow `online, hardware, grocery, pharmacy, pet`, except that the tote's group comes first. Within a group, lines keep kit order (category, then catalog). Items with no store (`buyAt` null: copies of documents, cash, a plan) are not lines; they are listed under `gather`.

**The tote.** The tote is not a catalog item, because the kit goes in it, so its shopping fields live in `CONTAINER_PURCHASES` (generic search term, Home Depot source). It is line 1 when the user has no tote. The tool reads that from `has_tote` when the assistant passes it. Otherwise the user is taken to have a tote once any item is `packed`, since packing means putting something in the tote, and not before. The output says which with `has_tote` and `has_tote_inferred`.

**Budget mode.** `budget_mode: true` keeps the lines to essential items (`essential: true`) and the tote. Every other item with something left to buy moves to `later`, listed with its id, name, quantity and sources but no link. `gather` is unchanged. Off by default.

**Search links.** Each line has a generic `search_term` and a `url` built from that term alone: no retailer, affiliate tag, tracking parameter, price or scraping. The patterns live in `STORE_SEARCH_URL_TEMPLATES` in `packages/shared/src/shopping/store-search.ts`, one per store category: `online` uses a shopping search (`https://www.google.com/search?tbm=shop&q=<term>`), and the in-store categories use a map search for nearby stores (`https://www.google.com/maps/search/?api=1&query=<term>`). They are provisional; the retailer decision issue will revisit them.

**Fit** is the same planned fit as `get_tote`: `packTote` over the whole kit at full `units`, at the list's days. `in_tote` lists the ids that go in the tote, and `beside_tote` lists what is stored beside it, with `reason` (`not-packable` or `no-space`) and a plain-words `why`. An item can be in both when only some units fit.

**Sources.** Each line, `gather` and `later` entry, and region hazard cites source ids under `sources`. The top-level `sources` map resolves each cited id once to its title and URL, so the output stays short.

A single adult in Mesa, AZ with nothing bought is 54 lines plus 4 to gather, about 18 KB of JSON.

## Prompt: prep_my_tote

`initialize` declares the `prompts` capability. `prompts/list` returns one prompt, `prep_my_tote`, which clients usually show as a slash command or a menu entry. `prompts/get` returns a single user message that walks the assistant through the flow, one step at a time:

1. **Location.** Call `get_household`, then confirm the user's state or ZIP. It asks for a two-letter state code or a 5-digit ZIP only, and never for a street address.
2. **Household.** Ask who the user is preparing for (adults, seniors, children and their ages, infants, pets, medical and dietary needs, days). If a household is saved, show it and ask whether it is still right. Ask rather than guess.
3. **Save** with `set_household`, sending only what the user said or confirmed.
4. **Shopping list.** Ask about the tote and budget mode, call `build_shopping_list`, and cite the source titles and URLs it returns.
5. **Track.** Offer to record purchases with `update_items`, one batch per trip.

| Argument   | Required | Meaning                                                                                          |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| `location` | no       | A two-letter state code (e.g. `AZ`, any case) or a ZIP. The assistant confirms it before saving. |

A ZIP+4 is cut to its five digits, so the prompt never carries more than `set_household` stores. Anything else (a street address, an unknown state, an unknown argument) fails with JSON-RPC `-32602`, as does an unknown prompt name. The text lives in `packages/shared/src/mcp/prompts.ts`.

## Resource: cafe-listo://sources

`initialize` declares the `resources` capability. `resources/list` returns one resource, `cafe-listo://sources`, and `resources/read` returns it as `application/json`:

```json
{
  "sources": [
    {
      "id": "ready-water",
      "title": "Water",
      "publisher": "Ready.gov (FEMA)",
      "url": "https://www.ready.gov/water",
      "accessed": "2026-10-11"
    }
  ]
}
```

It is JSON rather than Markdown because tools cite sources by id, with the same `id`, `title` and `url` fields as `build_shopping_list`'s `sources` map, so a client or the assistant can match the two without parsing prose. JSON also keeps `accessed: null` (the page could not be retrieved, so it is unverified) and `note` (the caveat) explicit. An unknown URI fails with `-32002` (resource not found) and the URI in `data`. The code is `packages/shared/src/mcp/resources.ts`, and the data is `SOURCES` in `packages/shared/src/data/sources.ts`.

## Example conversation

A user in Mesa, Arizona picks **prep_my_tote** in their MCP client and passes `location: 85201`. Tool calls are shown in brackets.

> **User:** _(prep_my_tote, location 85201)_
>
> **Assistant:** [`get_household` → `profile: null`] You don't have a household saved yet. You gave ZIP 85201. Is that right? I only need a state or ZIP, never a street address.
>
> **User:** Yes.
>
> **Assistant:** Who are you preparing for? How many adults (18-64) and seniors (65+), any children (and their ages) or infants, any pets, any medical or dietary needs? And how many days should the kit cover? The default is 3, and the maximum is 14.
>
> **User:** Me and my partner, both in our 30s, and a dog. No special needs. Let's do 3 days.
>
> **Assistant:** [`set_household` with `zip: "85201"`, `adults: 2`, `pets: { dogs: 1 }`, `days: 3` → FEMA Region 9] Saved: 2 adults and 1 dog in AZ (FEMA Region 9), planning for 3 days. Do you already own a tote, and do you want essentials first to keep the cost down?
>
> **User:** No tote yet. Everything's fine.
>
> **Assistant:** [`build_shopping_list` with `has_tote: false`] Here's your list, grouped by store:
>
> **Hardware:** the 27 gal tote, then …
> **Grocery:** water, 1 gallon per person per day for 3 days … ([Water, Ready.gov](https://www.ready.gov/water))
> **Pet:** dog food for 3 days …
>
> To gather at home: copies of documents and some cash. Bulk water is stored beside the tote, since it doesn't fit inside.
>
> Want me to track what you buy? Tell me when you've finished a trip and I'll mark it all at once.
>
> **User:** I got everything on the grocery list.
>
> **Assistant:** [`update_items` with every grocery line as `bought`] Done. Those items are marked bought. Once they're in the tote, tell me and I'll mark them packed.

The list itself is abbreviated here. The real one has every line's quantity and search link.

### Screenshots

<!-- TODO: add screenshots of prep_my_tote in an MCP client (prompt picker, shopping list with citations, update_items confirmation) once the manual check is done. -->

_Screenshots to come._

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

`POST /login`, `/register`, and `/token` are rate limited per client IP (`X-Real-IP`, else the last `X-Forwarded-For` entry, which Railway's edge appends; the first entry is client-controlled and never used): login 10 per minute, register 30 per hour, token 60 per minute per client IP and `client_id` (claude.ai calls `/register` and `/token` from shared egress IPs). The limits live in `OAUTH_RATE_LIMITS` in `src/routes/oauth.ts`. Counters are in memory, so they reset on restart and are not shared between replicas. Each limiter tracks at most 10,000 keys: expired windows are swept and the oldest are evicted beyond that. Over the limit, `/token` and `/register` return a `429` OAuth error and `/login` returns an error page, each with `Retry-After`. Keep Supabase Auth's own rate limits at or above these.

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

Build, start and healthcheck are set on the Railway service itself; `railway.json` is not honored by this project. The service builds with `pnpm --filter @cafe-listo/mcp-server... build`, starts `node --enable-source-maps packages/mcp-server/dist/index.js`, and uses `/ready` as the deploy healthcheck. Changes under `packages/mcp-server/`, `packages/shared/`, or to the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, or `railway.json` trigger a redeploy. Railpack takes Node from `engines.node` (`22.x`) and pnpm from `packageManager` in the root `package.json`.

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

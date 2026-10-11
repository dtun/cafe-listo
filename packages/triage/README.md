# @cafe-listo/triage

The weekly feedback triage loop. It reads new feedback, asks a model for a triage plan, validates the plan, and files GitHub issues labelled `feedback` and `needs-triage` for humans to promote. It only analyzes and files; it never does the work. Terms are defined in [CONTEXT.md](../../CONTEXT.md).

- `src/plan/` holds everything safety depends on, as pure tested functions: the plan schema, `validatePlan` and the policy, reporter aliasing, the cursor, the provenance marker, the exact command lines, and the parsing of every untrusted input.
- `src/cli.ts` is one script that runs the loop top to bottom.
- `src/prompt.md` holds the analyst instructions, which are bundled into `dist/cli.js`.
- `launchd/` holds the weekly schedule.

## What a run does

1. Takes `$TRIAGE_STATE_DIR/lock` (real runs only). If a pending plan exists, it re-validates it and files the rest without asking the model again.
2. Reads feedback past the `(created_at, id)` cursor through `supabase --workdir $REPO_DIR db query --linked`, then aliases the reporters.
3. Lists open issues and issues closed in the last 90 days with `gh`. It fails if the open list is shorter than the open count.
4. Runs `claude -p --tools "" --strict-mcp-config --no-session-persistence --json-schema …`, then parses and validates the output. Any problem means nothing is filed.
5. Saves the plan as `pending.json`. It files each action with `gh` (body on stdin), but first checks GitHub for the action's marker, so a crash never causes a double file. Each action is marked done as it lands. Only after every action has landed does the cursor move and `pending.json` get deleted.

## Security model

- **`validatePlan` is the invariant.** Nothing is filed until it returns no problems. It enforces:
  - id coverage
  - caps on creates, comments and total
  - the label allowlist (never `ready-for-agent`) and the required labels
  - one-line Conventional titles
  - non-empty bodies
  - comments only on trusted or `feedback` issues
  - no mentions, cross-repo refs or links of any kind
  - `#N` only to the issues shown
  - no PII in titles, bodies, the summary or any reason
- **The model gets no tools.** The prompt marks the inputs as untrusted, and the inputs are fenced so they can't break out.
- **There is no shell.** Values go in as `--flag=value` and bodies on stdin. Both parts of the cursor are validated before they reach SQL.
- **Logs hold only counts, indexes, action types and URLs.** Plan text stays in `pending.json` (mode 0600) and on GitHub.
- **There are no keys on disk.** The loop uses the supabase, gh and claude logins. A next step would be a fine-grained `GH_TOKEN` with Issues: write on this repo only.

## Run it

```sh
pnpm --filter @cafe-listo/triage build
REPO_DIR=~/Developer/cafe-listo node packages/triage/dist/cli.js run --dry-run   # files nothing, writes no state
REPO_DIR=~/Developer/cafe-listo node packages/triage/dist/cli.js run
```

Environment variables:

- `REPO_DIR` (required): the main checkout, after `supabase link`.
- `TRIAGE_STATE_DIR`: the state dir, which holds `cursor`, `pending.json`, `lock`, `checkout/` and `launchd.log`. Defaults to `~/.cafe-listo/triage`.
- `GITHUB_REPO`: defaults to `dtun/cafe-listo`.
- `TRIAGE_TRUSTED_AUTHORS`: comma-separated logins. Defaults to `dtun`.

Exit codes are 0 for success, 1 for a failure (including validation problems or a held lock), and 2 for bad usage. To abandon a pending plan, delete `pending.json`. If a run hits a supabase timeout, run `supabase projects list` once to re-authorize the Keychain.

## Schedule with launchd

```sh
packages/triage/launchd/install.sh              # write launcher + plist, (re)load the agent
packages/triage/launchd/install.sh --no-load    # write files only
packages/triage/launchd/install.sh --uninstall  # remove launcher + plist; keeps state
```

The job runs Saturdays at 08:07. The launcher keeps its own checkout in `$TRIAGE_STATE_DIR/checkout`, hard-reset to `origin/main`. It builds this package and runs `dist/cli.js run`.

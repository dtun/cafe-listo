# Feedback triage routine

Weekly (Saturday 08:07 local) launchd job that turns new `submit_feedback` rows into GitHub issues and comments.

1. Fetch `feedback` rows newer than the watermark with `supabase db query --linked` (your CLI login, the checkout's linked project; no keys on disk). Only the `.rows` of the CLI's untrusted-data wrapper are used, as data. `user_id` is replaced with per-run aliases (`r1`, `r2`, …) before anything else sees it (`alias.jq`).
2. Fetch open issues plus issues closed in the last 90 days (with author), for dedupe. Each `gh` call must succeed. The open list is checked against the GraphQL open-issue count, so an empty or truncated list fails the run instead of producing duplicates.
3. Run headless `claude -p --tools "" --strict-mcp-config --no-session-persistence --json-schema schema.json` with `prompt.md`. Output: a JSON plan (`create_issue` / `comment_issue` / `skip`).
4. Validate the plan (`validate.jq`). Any problem rejects the whole plan.
5. Record the plan as pending, then execute it with `gh`, appending a footer with the feedback ids. Write `report.md` and post a macOS notification.

## Local vs repo

| Where                                                         | What                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Repo (`ops/feedback-triage/`)                                 | `run.sh`, `prompt.md`, `schema.json`, `validate.jq`, `alias.jq`, templates, tests |
| `~/.cafe-listo/feedback-triage/`                              | `launch.sh`, `config.env`, `state/{watermark,pending}`, `runs/`, `launchd.log`    |
| `~/Library/LaunchAgents/com.cafe-listo.feedback-triage.plist` | launchd agent → `launch.sh`                                                       |

`launch.sh` runs `git fetch origin main`, exports `ops/feedback-triage` from `origin/main` into a temp dir with `git archive`, runs that `run.sh`, and deletes the temp dir. The job always runs reviewed `main` code, whatever branch the checkout is on. **Changes take effect once merged to main.** You only need to re-run `install.sh` if the launcher or plist templates change.

## Safety model

- **The model has no tools.** `--tools ""` and `--strict-mcp-config` mean it can only read the input and return JSON. The shell script does all the I/O.
- **Validation gate** (`validate.jq`). The plan is rejected if:
  - a feedback id is unaccounted for, or unknown
  - more than `MAX_ACTIONS` (10) non-skip actions in total, creates, or comments; or more than one comment on the same issue
  - a title isn't `feat|fix|docs(<scope>): …`
  - a body is empty
  - `feedback` and `needs-triage` labels are missing
  - a label is outside the allowlist
  - a comment has no `issue_number`, targets an issue the model wasn't shown, or targets an issue not opened by `MAINTAINER` (default: repo owner) and not labelled `feedback`. Outsiders' issue bodies are untrusted input too.
  - a title or body has an `@`-mention, a URL, an `owner/repo#N` reference, or a `#N` that isn't in ISSUES
  - a title contains a newline
- **Labels**: allowlist in `run.sh` (`ALLOWED_LABELS`). Never `ready-for-agent`. Humans promote issues out of `needs-triage`.
- **PII**: the repo is public. Titles and bodies that match an email, a UUID, or a phone number (US formats with or without separators, `+CC` international) are rejected. Years, dates, and quantities pass. Raw user ids never leave the run dir, and the raw query output is deleted after aliasing.
- **Watermark** (`state/watermark`): the max `created_at` of the batch, stored as fixed-width UTC microseconds so it round-trips exactly. It must match a strict timestamp regex before it goes into the SQL. It advances only once the whole plan is done, and never on `--dry-run`. A run that fails before filing anything retries the same batch next time.
- **Resume**: before filing, the validated plan's run dir is written to `state/pending`. Each finished action is appended to `<run dir>/actions.done` as `<index>\t<url>`. If a run dies partway, the next run re-validates and resumes that plan, skipping finished actions, without asking the model again. It then advances the watermark and starts a fresh run. `--dry-run` with a pending plan only reports it. To abandon a plan, delete `state/pending`. Unfiled feedback then gets re-analysed.
- **Prompt**: FEEDBACK and ISSUES are marked as untrusted data, and the model is told to ignore instructions inside them. The validator enforces the rules anyway.

## Install / uninstall

Requires `supabase login` (CLI ≥ 2.120) with the project linked in the checkout (`supabase link`), plus `gh` and `claude` logins. The CLI token lives in the macOS Keychain. If launchd can't read it (a Keychain prompt with nobody there to answer), the query times out after 120s and the run fails. Fix it by running `supabase projects list` once in a terminal and allowing access.

```sh
ops/feedback-triage/install.sh             # write launcher + config.env + plist, (re)load agent
ops/feedback-triage/install.sh --no-load   # write files only
ops/feedback-triage/install.sh --uninstall # unload, remove plist + launcher (keeps state, runs, config.env)
```

Idempotent. `REPO_DIR` is resolved to the main checkout even when run from a worktree. Install fails unless `$REPO_DIR/supabase/.temp/project-ref` exists (run `supabase link`). `config.env` is written only if absent (`REPO_DIR`, `REPO`; `MAINTAINER` and `MAX_ACTIONS` can also go here). The launchd reload retries `bootstrap` after `bootout`. Env overrides: `CAFE_LISTO_TRIAGE_HOME`, `LAUNCH_AGENTS_DIR`.

## Run manually

```sh
~/.cafe-listo/feedback-triage/launch.sh --dry-run   # main code; real fetch + claude, files nothing, keeps watermark
CAFE_LISTO_TRIAGE_HOME=/tmp/triage REPO_DIR=$PWD ops/feedback-triage/run.sh --dry-run   # working-tree code
launchctl kickstart gui/$(id -u)/com.cafe-listo.feedback-triage           # real run now
```

Each run writes `runs/<timestamp>[-dry]/`: `feedback.json`, `issues.json`, `input.md`, `claude.json`, `plan.json`, `validation-errors.txt` (if rejected), `watermark.next`, `actions.done`, `action-N.md`, `report.md`, `run.log`.

## Tests

`bash ops/feedback-triage/test.sh` covers `validate.jq` (every rule, with `fixtures/`), `alias.jq`, and the watermark regex. It also runs `run.sh` end to end against stubbed `supabase`/`gh`/`claude` (partial failure and resume, fetch failures, dry run with a pending plan), `install.sh` from a worktree (main-checkout resolution, supabase-link check, stubbed `launchctl` bootstrap retry), and the rendered launcher with no args. Needs only bash, jq, and git. Runs in CI.

## Schedule

Edit `StartCalendarInterval` in `com.cafe-listo.feedback-triage.plist.template` (`Weekday` 0/7 = Sunday … 6 = Saturday), merge, pull, then re-run `install.sh`. If the Mac is asleep at the scheduled time, the job runs on wake. If it is powered off, that week's run is skipped.

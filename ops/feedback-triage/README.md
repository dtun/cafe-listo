# Feedback triage routine

Weekly (Saturday 08:07 local) launchd job that turns new `submit_feedback` rows into GitHub issues and comments.

1. Fetch `feedback` rows newer than the watermark from Supabase (service-role key read at run time from `packages/mcp-server/.env`). `user_id` is replaced with per-run aliases (`r1`, `r2`, …) before anything else sees it (`alias.jq`).
2. Fetch open issues plus issues closed in the last 90 days, for dedupe.
3. Run headless `claude -p --tools "" --strict-mcp-config --no-session-persistence --json-schema schema.json` with `prompt.md`. Output: a JSON plan (`create_issue` / `comment_issue` / `skip`).
4. Validate the plan (`validate.jq`). Any problem rejects the whole plan.
5. Execute with `gh`, appending a footer with the feedback ids. Write `report.md`, post a macOS notification.

## Local vs repo

| Where                                                         | What                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Repo (`ops/feedback-triage/`)                                 | `run.sh`, `prompt.md`, `schema.json`, `validate.jq`, `alias.jq`, templates, tests |
| `~/.cafe-listo/feedback-triage/`                              | `launch.sh`, `config.env`, `state/watermark`, `runs/`, `launchd.log`              |
| `~/Library/LaunchAgents/com.cafe-listo.feedback-triage.plist` | launchd agent → `launch.sh`                                                       |

`launch.sh` runs `git fetch origin main`, exports `ops/feedback-triage` from `origin/main` into a temp dir with `git archive`, runs that `run.sh`, and deletes the temp dir. The job always runs reviewed `main` code, whatever branch the checkout is on. **Changes take effect once merged to main.** You only need to re-run `install.sh` if the launcher or plist templates change.

## Safety model

- **The model has no tools.** `--tools ""` and `--strict-mcp-config` mean it can only read the input and return JSON. The shell script does all the I/O.
- **Validation gate** (`validate.jq`). The plan is rejected if:
  - a feedback id is unaccounted for, or unknown
  - more than 10 issues would be created (`MAX_CREATES`)
  - a title isn't `feat|fix|docs(<scope>): …`
  - a body is empty
  - `feedback` and `needs-triage` labels are missing
  - a label is outside the allowlist
  - a comment has no `issue_number` or targets an issue the model wasn't shown
- **Labels**: allowlist in `run.sh` (`ALLOWED_LABELS`). Never `ready-for-agent`. Humans promote issues out of `needs-triage`.
- **PII**: the repo is public. Titles/bodies matching an email, UUID, or US-style phone number are rejected. Raw user ids never leave the run dir, and `feedback.raw.json` is deleted after aliasing.
- **Watermark** (`state/watermark`, max `created_at` of the batch) only advances after every action succeeds and never on `--dry-run`. A failed run retries the same batch next week. If a run fails partway through, some issues may already be filed. Check the run's `report.md`/`run.log` before re-running.

## Install / uninstall

```sh
ops/feedback-triage/install.sh             # write launcher + config.env + plist, (re)load agent
ops/feedback-triage/install.sh --no-load   # write files only
ops/feedback-triage/install.sh --uninstall # unload, remove plist + launcher (keeps state, runs, config.env)
```

Idempotent. `config.env` is written only if absent (`REPO_DIR` = this checkout, `REPO`, `ENV_FILE`; `MAX_CREATES` can also go here). Env overrides: `CAFE_LISTO_TRIAGE_HOME`, `LAUNCH_AGENTS_DIR`.

## Run manually

```sh
~/.cafe-listo/feedback-triage/launch.sh --dry-run   # main code; real fetch + claude, files nothing, keeps watermark
CAFE_LISTO_TRIAGE_HOME=/tmp/triage ops/feedback-triage/run.sh --dry-run   # working-tree code
launchctl kickstart gui/$(id -u)/com.cafe-listo.feedback-triage           # real run now
```

Each run writes `runs/<timestamp>[-dry]/`: `feedback.json`, `issues.json`, `input.md`, `claude.json`, `plan.json`, `validation-errors.txt` (if rejected), `action-N.md`, `report.md`, `run.log`.

## Tests

`bash ops/feedback-triage/test.sh` checks `validate.jq` and `alias.jq` against `fixtures/`. Needs only bash and jq. Runs in CI.

## Schedule

Edit `StartCalendarInterval` in `com.cafe-listo.feedback-triage.plist.template` (`Weekday` 0/7 = Sunday … 6 = Saturday), merge, pull, then re-run `install.sh`. If the Mac is asleep at the scheduled time, the job runs on wake. If it is powered off, that week's run is skipped.

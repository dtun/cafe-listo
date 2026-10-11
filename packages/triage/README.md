# @cafe-listo/triage

The weekly feedback triage loop. It reads new feedback, asks a model for a triage plan, validates the plan, and files GitHub issues labelled `feedback` and `needs-triage`. Humans promote them from there. The loop only analyzes and files; it never does the work. Terms are defined in [CONTEXT.md](../../CONTEXT.md).

## The loop

`TriageFeedback` (`src/usecases/triage-feedback.ts`):

0. Take the ledger's run lock (real runs only), so a manual run can't overlap the scheduled one.
1. If the ledger holds a pending plan, re-validate it and finish its remaining actions. The model is not asked again.
2. Read feedback past the `(created_at, id)` cursor (`FeedbackReader`) and replace user ids with reporter aliases.
3. List open issues and issues closed in the last 90 days (`IssueTracker`). If the open list is shorter than the open count, fail: dedupe would be blind.
4. Analyze (`PlanAnalyzer`). The raw output is parsed with `TriagePlanSchema` and checked with `validatePlan`. Any problem rejects the plan and nothing is filed.
5. Save the plan as pending with a fresh plan id. File each action with a provenance footer (the feedback ids and a hidden `<!-- triage:<planId>:<index> -->` marker) and mark it done. Before each create or comment, look for that marker on GitHub; a match is recorded as done instead of being filed twice (a crash between filing and recording).
6. Clear the pending plan and advance the cursor, together, only after every action has succeeded.

## Modules

| Path               | What                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/plan/`        | TriagePlan module: deep and pure. `TriagePlanSchema`, `triagePlanJsonSchema`, `aliasReporters`, `validatePlan` |
| `src/ports.ts`     | The seams: `FeedbackReader`, `IssueTracker`, `PlanAnalyzer`, `TriageLedger`                                    |
| `src/usecases/`    | `TriageFeedback`, `Clock`, `UseCaseResult`                                                                     |
| `src/adapters/`    | supabase CLI, gh CLI, claude CLI, file ledger, macOS notifier; all processes go through `exec.ts`              |
| `src/container.ts` | Composition root (`cliContainer`) and env config                                                               |
| `src/cli.ts`       | Driving adapter: `triage run [--dry-run]`                                                                      |
| `src/prompt.md`    | Analyst instructions, bundled into `dist/cli.js`                                                               |
| `launchd/`         | Scheduling adapter: `install.sh`, plist and launcher templates                                                 |

`src/__tests__/layer-isolation.test.ts` keeps `plan/` and `usecases/` free of adapters, `child_process` and `fs`, and `plan/` free of ports and use cases too.

## Security model

- **`validatePlan` is the invariant.** Every adapter that runs the loop goes through it, and the use case files nothing until it returns no problems. It enforces: every feedback id accounted for and none unknown; at most 10 actions overall, 10 creates and 10 comments, and one comment per issue; labels from the allowlist, never `ready-for-agent` (whatever the policy says); `feedback` and `needs-triage` present; `feat|fix|docs(<scope>): …` titles with no newlines; non-empty bodies; comments only on issues the model was shown that were opened by a trusted author or labelled `feedback`; no `@`-mentions, `owner/repo#N`, or `#N` outside the issues shown; no links of any kind (URLs, `//host`, bare hosts, markdown links or images, raw HTML); no emails, UUIDs or phone numbers. The PII and link rules also cover the summary and every reason.
- **Logs hold no plan or feedback text.** Problems name an action by index and type and a field by name ("action 2 (create_issue): possible email in body"), never the matched text or the title. The report and the CLI output carry only counts, indexes, action types, issue numbers and URLs. Plan text lives in `pending.json` (0600) until the plan is done, and on GitHub.
- **The model gets no tools.** `claude -p --tools "" --strict-mcp-config --no-session-persistence --json-schema …`, run from the state dir. It reads its input and returns JSON. The prompt marks FEEDBACK and ISSUES as untrusted data, and backticks in that JSON are escaped so the data can't close its fence. The validator enforces the rules anyway.
- **No shell anywhere.** Adapters pass argument arrays to `execFile`-style spawns. Values are attached as `--flag=value` and bodies go in on stdin. Both parts of the cursor (fixed-width UTC, UUID) must match strict patterns before they go into SQL.
- **No keys on disk.** It uses the Supabase CLI login with the main checkout's linked project, and the gh and claude logins.
- **Least privilege, next step.** The only write the loop needs is to create issues and comments. A fine-grained token with Issues: write on this one repo, set as `GH_TOKEN` for the job, would replace the maintainer's full `gh` login. A read-only database role would do the same for Supabase.

## Run it

```sh
pnpm --filter @cafe-listo/triage build
REPO_DIR=~/Developer/cafe-listo node packages/triage/dist/cli.js run --dry-run   # analyze and validate; files nothing, writes no state
REPO_DIR=~/Developer/cafe-listo node packages/triage/dist/cli.js run             # file the plan
```

| Env                      | Default                |                                                              |
| ------------------------ | ---------------------- | ------------------------------------------------------------ |
| `REPO_DIR`               | (required)             | Main checkout with `supabase link` done                      |
| `TRIAGE_STATE_DIR`       | `~/.cafe-listo/triage` | `cursor`, `pending.json`, `lock`, `checkout/`, `launchd.log` |
| `GITHUB_REPO`            | `dtun/cafe-listo`      |                                                              |
| `TRIAGE_TRUSTED_AUTHORS` | `dtun`                 | Comma-separated logins whose issues may get comments         |

Exit codes: 0 ok, 1 failed (the report says why, with each validation problem), 2 usage. A run that finds the lock held by a live process exits 1 with `locked`; a lock left by a dead process is taken over. A dry run with a pending plan reports the plan and stops. To abandon a pending plan, delete `pending.json`; its unfiled feedback is then analyzed again.

If a scheduled run fails with a supabase timeout, launchd couldn't read the CLI token from the Keychain. Run `supabase projects list` once in a terminal and allow access.

## Schedule with launchd

```sh
packages/triage/launchd/install.sh              # write launcher + plist, (re)load the agent
packages/triage/launchd/install.sh --no-load    # write files only
packages/triage/launchd/install.sh --uninstall  # unload, remove launcher + plist; keeps state
```

The job runs on Saturdays at 08:07 local time. If the Mac is asleep then, it runs on wake. The launcher keeps its own checkout in `$TRIAGE_STATE_DIR/checkout`, pinned to `origin/main`. Each run it fetches, force-checks out and hard-resets to `origin/main`, removes untracked and ignored files except `node_modules`, runs `pnpm install --frozen-lockfile`, builds this package and runs `dist/cli.js run`, so only merged code runs. `REPO_DIR` is resolved to the main checkout through `git-common-dir`, even when you run the installer from a worktree. Re-run `install.sh` only when the launcher or plist templates change.

## Tests

`pnpm --filter @cafe-listo/triage test`. The plan rules are vitest table tests ported from the #58 fixtures. The use case is tested with in-memory fakes, and the adapters' argument building through a fake `exec`. The CLI is driven end to end with the real adapters over a fake `exec`, and `install.sh` runs against temp git repos.

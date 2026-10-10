#!/bin/bash
# Weekly Café Listo feedback triage: fetch -> analyze (Claude, no tools) -> validate -> file issues.
# Usage: run.sh [--dry-run]   (dry run writes the plan and report but files nothing and keeps the watermark)
# Code (prompt, schema, validator) comes from this script's directory; state, runs and config.env
# live in $CAFE_LISTO_TRIAGE_HOME (default ~/.cafe-listo/feedback-triage). Bash 3.2 compatible.
#
# A validated plan is recorded in state/pending before anything is filed, and each finished action is
# appended to <run dir>/actions.done. If a run dies partway, the next run resumes that plan (skipping
# finished actions) instead of re-asking the model, and only then starts a fresh analysis.
set -euo pipefail
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOME_DIR="${CAFE_LISTO_TRIAGE_HOME:-$HOME/.cafe-listo/feedback-triage}"
# shellcheck source=/dev/null
[ -f "$HOME_DIR/config.env" ] && . "$HOME_DIR/config.env"
REPO_DIR="${REPO_DIR:-}"
REPO="${REPO:-dtun/cafe-listo}"
MAINTAINER="${MAINTAINER:-${REPO%%/*}}"
MAX_ACTIONS="${MAX_ACTIONS:-10}"
STATE_DIR="$HOME_DIR/state"
WATERMARK_FILE="$STATE_DIR/watermark"
PENDING_FILE="$STATE_DIR/pending"
# The watermark is interpolated into SQL, so it must look exactly like a timestamp.
TIMESTAMP_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
ALLOWED_LABELS='["feedback","needs-triage","feature","bug","documentation","mcp-server","shared","mobile","landing"]'
DRY_RUN=0; [ "${1:-}" = "--dry-run" ] && DRY_RUN=1

SUFFIX=""; [ $DRY_RUN = 0 ] || SUFFIX=-dry
RUN_BASE="$HOME_DIR/runs/$(date +%Y-%m-%dT%H%M%S)$SUFFIX"
RUN_DIR=$RUN_BASE; k=1
while [ -e "$RUN_DIR" ]; do RUN_DIR="$RUN_BASE.$k"; k=$((k + 1)); done
mkdir -p "$RUN_DIR" "$STATE_DIR"
exec > >(tee -a "$RUN_DIR/run.log") 2>&1
log() { echo "[$(date +%H:%M:%S)] $*"; }
notify() { osascript -e "display notification \"$1\" with title \"Café Listo feedback triage\"" >/dev/null 2>&1 || true; }
fail() { log "FAIL: $*"; notify "Failed: $*"; exit 1; }

# Prints validation problems for the plan in dir $1 (plan.json, feedback.json, issues.json).
validate_plan() {
  jq -r --argjson ids "$(jq 'map(.id)' "$1/feedback.json")" --argjson allowed "$ALLOWED_LABELS" \
    --argjson max "$MAX_ACTIONS" --argjson issues "$(jq 'map({number, author, labels})' "$1/issues.json")" \
    --arg maintainer "$MAINTAINER" -f "$SCRIPT_DIR/validate.jq" "$1/plan.json"
}

# Executes the plan in dir $1, skipping actions already listed in actions.done ("<index>\t<result>").
execute_plan() {
  local dir=$1 done_file="$1/actions.done" report="$1/report.md" footer n i a type ids reason body_file title num result
  footer=$'\n\n---\n<sub>Filed by the weekly feedback triage routine from `submit_feedback` records: %s</sub>'
  touch "$done_file"
  n=$(jq '.actions | length' "$dir/plan.json")
  i=-1
  while i=$((i + 1)); [ "$i" -lt "$n" ]; do
    if grep -q "^$i	" "$done_file"; then log "action $i already done"; continue; fi
    a=$(jq -c ".actions[$i]" "$dir/plan.json")
    type=$(jq -r .type <<<"$a"); ids=$(jq -r '.feedback_ids | join(", ")' <<<"$a"); reason=$(jq -r .reason <<<"$a")
    body_file="$dir/action-$i.md"
    case $type in
      create_issue)
        title=$(jq -r .title <<<"$a")
        { jq -r .body <<<"$a"; printf "$footer" "$ids"; } > "$body_file"
        LABEL_ARGS=(); for l in $(jq -r '.labels[]' <<<"$a"); do LABEL_ARGS+=(--label "$l"); done
        if [ $DRY_RUN = 1 ]; then result="(dry run)"; else
          result=$(gh issue create -R "$REPO" --title "$title" --body-file "$body_file" "${LABEL_ARGS[@]}") \
            || fail "create failed: $title ($(wc -l < "$done_file" | tr -d ' ')/$n actions done; next run resumes)"
        fi
        echo "- **Created** $title: $result. $reason" >> "$report" ;;
      comment_issue)
        num=$(jq -r .issue_number <<<"$a")
        { jq -r .body <<<"$a"; printf "$footer" "$ids"; } > "$body_file"
        if [ $DRY_RUN = 1 ]; then result="(dry run)"; else
          result=$(gh issue comment "$num" -R "$REPO" --body-file "$body_file") \
            || fail "comment failed on #$num ($(wc -l < "$done_file" | tr -d ' ')/$n actions done; next run resumes)"
        fi
        echo "- **Commented** on #$num: $result. $reason" >> "$report" ;;
      skip)
        result="-"
        echo "- **Skipped** $ids: $reason" >> "$report" ;;
    esac
    [ $DRY_RUN = 1 ] || printf '%s\t%s\n' "$i" "$result" >> "$done_file"
    log "action $i $type done"
  done
}

# Marks the plan in dir $1 complete: advance the watermark, clear pending.
finish_plan() {
  cp "$1/watermark.next" "$WATERMARK_FILE"
  rm -f "$PENDING_FILE"
  log "watermark -> $(cat "$WATERMARK_FILE")"
}

# --- 0. Resume an unfinished plan ---------------------------------------------
if [ -f "$PENDING_FILE" ]; then
  PLAN_DIR=$(cat "$PENDING_FILE")
  [ -f "$PLAN_DIR/plan.json" ] && [ -f "$PLAN_DIR/watermark.next" ] \
    || fail "pending plan missing at $PLAN_DIR; inspect it, then remove $PENDING_FILE"
  DONE_N=$(wc -l < "$PLAN_DIR/actions.done" 2>/dev/null | tr -d ' ' || echo 0)
  TOTAL_N=$(jq '.actions | length' "$PLAN_DIR/plan.json")
  if [ $DRY_RUN = 1 ]; then
    log "unfinished plan in $PLAN_DIR ($DONE_N/$TOTAL_N actions done); a real run resumes it first"
    exit 0
  fi
  log "resuming plan in $PLAN_DIR ($DONE_N/$TOTAL_N actions done)"
  PROBLEMS=$(validate_plan "$PLAN_DIR") || fail "validator error"
  [ -z "$PROBLEMS" ] || fail "pending plan no longer validates: $PROBLEMS"
  printf '\n## Resumed %s\n' "$(date '+%Y-%m-%d %H:%M')" >> "$PLAN_DIR/report.md"
  execute_plan "$PLAN_DIR"
  finish_plan "$PLAN_DIR"
  log "pending plan complete; starting a fresh run"
  exec "$SCRIPT_DIR/run.sh"
fi

# --- 1. Fetch ---------------------------------------------------------------
# Uses the Supabase CLI login and the checkout's linked project (REPO_DIR/supabase/.temp); no keys are read.
[ -n "$REPO_DIR" ] && [ -f "$REPO_DIR/supabase/.temp/project-ref" ] \
  || fail "no linked Supabase project in REPO_DIR='$REPO_DIR'; set REPO_DIR in $HOME_DIR/config.env and run supabase link"
command -v supabase >/dev/null || fail "supabase CLI not found"
SINCE=$(cat "$WATERMARK_FILE" 2>/dev/null || echo "1970-01-01T00:00:00Z")
[[ $SINCE =~ $TIMESTAMP_RE ]] || fail "watermark is not a timestamp: $SINCE"
log "fetching feedback since $SINCE"

# created_at is normalized to fixed-width UTC microseconds so string max() is the true max and
# the watermark round-trips exactly through ::timestamptz.
SQL="select id, user_id, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as created_at,
  kind, summary, details, tool_name, item_id, user_quote
  from public.feedback where created_at > '$SINCE'::timestamptz order by created_at limit 500"
TIMEOUT_CMD=$(command -v timeout || command -v gtimeout || true)
RC=0
${TIMEOUT_CMD:+$TIMEOUT_CMD 120} supabase --workdir "$REPO_DIR" db query --linked -o json "$SQL" < /dev/null \
  > "$RUN_DIR/feedback.raw.json" 2> "$RUN_DIR/supabase.err" || RC=$?
if [ "$RC" = 124 ]; then
  fail "supabase query timed out (likely a Keychain prompt); run 'supabase projects list' once to re-authorize"
elif [ "$RC" != 0 ]; then
  tail -5 "$RUN_DIR/supabase.err"; fail "feedback query failed (exit $RC)"
fi
# The CLI wraps rows in {boundary, rows, warning} to mark them untrusted. Only .rows go on, as data.
jq -e '.rows | arrays' "$RUN_DIR/feedback.raw.json" > "$RUN_DIR/feedback.rows.json" || fail "unexpected supabase output"
rm -f "$RUN_DIR/feedback.raw.json"

# Replace user ids with per-run aliases (r1, r2, ...) before anything reaches the model; raw ids are discarded.
jq -f "$SCRIPT_DIR/alias.jq" "$RUN_DIR/feedback.rows.json" > "$RUN_DIR/feedback.json"
rm -f "$RUN_DIR/feedback.rows.json"
COUNT=$(jq length "$RUN_DIR/feedback.json")
log "new feedback: $COUNT"
if [ "$COUNT" = 0 ]; then log "nothing to do"; exit 0; fi
jq -r 'map(.created_at) | max' "$RUN_DIR/feedback.json" > "$RUN_DIR/watermark.next"

# Each fetch must succeed on its own; an empty or truncated open list would cause duplicate issues.
CLOSED_SINCE=$(date -u -v-90d +%Y-%m-%d 2>/dev/null || date -u -d '90 days ago' +%Y-%m-%d)
FIELDS=number,state,title,labels,body,author
gh issue list -R "$REPO" --state open --limit 300 --json "$FIELDS" > "$RUN_DIR/issues.open.json" \
  || fail "open issue fetch failed"
gh issue list -R "$REPO" --state closed --search "closed:>=$CLOSED_SINCE" --limit 200 --json "$FIELDS" \
  > "$RUN_DIR/issues.closed.json" || fail "closed issue fetch failed"
OPEN_TOTAL=$(gh api graphql -F owner="${REPO%%/*}" -F name="${REPO#*/}" \
  -f query='query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issues(states:OPEN){totalCount}}}' \
  --jq .data.repository.issues.totalCount) || fail "open issue count failed"
OPEN_N=$(jq length "$RUN_DIR/issues.open.json") || fail "open issue list is not JSON"
[[ $OPEN_TOTAL =~ ^[0-9]+$ ]] || fail "bad open issue count: $OPEN_TOTAL"
EXPECTED=$OPEN_TOTAL; [ "$EXPECTED" -gt 300 ] && EXPECTED=300
[ "$OPEN_N" -ge "$EXPECTED" ] || fail "open issue list incomplete ($OPEN_N of $OPEN_TOTAL)"
jq -s 'add | map({number, state, title, author: (.author.login // ""), labels: [.labels[].name], body: (.body // "" | .[0:400])})' \
  "$RUN_DIR/issues.open.json" "$RUN_DIR/issues.closed.json" > "$RUN_DIR/issues.json" || fail "issue merge failed"
log "issues for dedupe: $(jq length "$RUN_DIR/issues.json") ($OPEN_N open)"

# --- 2. Analyze (no tools) ----------------------------------------------------
{ cat "$SCRIPT_DIR/prompt.md"
  printf '\n\n## MAINTAINER\n%s\n' "$MAINTAINER"
  printf '\n## FEEDBACK\n```json\n'; cat "$RUN_DIR/feedback.json"
  printf '\n```\n\n## ISSUES\n```json\n'; cat "$RUN_DIR/issues.json"; printf '\n```\n'
} > "$RUN_DIR/input.md"

log "analyzing"
(cd "$HOME_DIR" && claude -p --tools "" --strict-mcp-config --no-session-persistence \
  --output-format json --json-schema "$(cat "$SCRIPT_DIR/schema.json")" < "$RUN_DIR/input.md") \
  > "$RUN_DIR/claude.json" || fail "claude run failed"
jq -e '.structured_output' "$RUN_DIR/claude.json" > "$RUN_DIR/plan.json" || fail "no structured plan in claude output"

# --- 3. Validate ----------------------------------------------------------------
PROBLEMS=$(validate_plan "$RUN_DIR") || fail "validator error"
if [ -n "$PROBLEMS" ]; then
  echo "$PROBLEMS" > "$RUN_DIR/validation-errors.txt"
  fail "plan rejected ($(echo "$PROBLEMS" | wc -l | tr -d ' ') problems); see $RUN_DIR/validation-errors.txt"
fi
log "plan valid: $(jq -r '[.actions[] | .type] | group_by(.) | map("\(.[0])=\(length)") | join(" ")' "$RUN_DIR/plan.json")"

# --- 4. Execute -----------------------------------------------------------------
{ echo "# Feedback triage $(date +%Y-%m-%d)$([ $DRY_RUN = 1 ] && echo ' (dry run)')"; echo
  jq -r '.summary' "$RUN_DIR/plan.json"; echo; echo "## Actions"; } > "$RUN_DIR/report.md"
[ $DRY_RUN = 1 ] || echo "$RUN_DIR" > "$PENDING_FILE"
execute_plan "$RUN_DIR"

# --- 5. Advance watermark & report ----------------------------------------------
[ $DRY_RUN = 1 ] || finish_plan "$RUN_DIR"
log "report: $RUN_DIR/report.md"
notify "$COUNT feedback item(s) triaged$([ $DRY_RUN = 1 ] && echo ' (dry run)'). Report in runs/."

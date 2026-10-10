#!/bin/bash
# Weekly Café Listo feedback triage: fetch -> analyze (Claude, no tools) -> validate -> file issues.
# Usage: run.sh [--dry-run]   (dry run writes the plan and report but files nothing and keeps the watermark)
# Code (prompt, schema, validator) comes from this script's directory; state, runs and config.env
# live in $CAFE_LISTO_TRIAGE_HOME (default ~/.cafe-listo/feedback-triage). Bash 3.2 compatible.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOME_DIR="${CAFE_LISTO_TRIAGE_HOME:-$HOME/.cafe-listo/feedback-triage}"
# shellcheck source=/dev/null
[ -f "$HOME_DIR/config.env" ] && . "$HOME_DIR/config.env"
REPO_DIR="${REPO_DIR:-}"
REPO="${REPO:-dtun/cafe-listo}"
MAX_CREATES="${MAX_CREATES:-10}"
WATERMARK_FILE="$HOME_DIR/state/watermark"
# The watermark is interpolated into SQL, so it must look exactly like a timestamp.
TIMESTAMP_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
ALLOWED_LABELS='["feedback","needs-triage","feature","bug","documentation","mcp-server","shared","mobile","landing"]'
DRY_RUN=0; [ "${1:-}" = "--dry-run" ] && DRY_RUN=1

RUN_DIR="$HOME_DIR/runs/$(date +%Y-%m-%dT%H%M%S)$([ $DRY_RUN = 1 ] && echo -dry)"
mkdir -p "$RUN_DIR" "$HOME_DIR/state"
exec > >(tee -a "$RUN_DIR/run.log") 2>&1
log() { echo "[$(date +%H:%M:%S)] $*"; }
notify() { osascript -e "display notification \"$1\" with title \"Café Listo feedback triage\"" >/dev/null 2>&1 || true; }
fail() { log "FAIL: $*"; notify "Failed: $*"; exit 1; }

# --- 1. Fetch ---------------------------------------------------------------
# Uses the Supabase CLI login and the checkout's linked project (REPO_DIR/supabase/.temp); no keys are read.
[ -n "$REPO_DIR" ] && [ -d "$REPO_DIR/supabase" ] || fail "REPO_DIR not a cafe-listo checkout (set it in $HOME_DIR/config.env)"
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
NEW_WATERMARK=$(jq -r 'map(.created_at) | max' "$RUN_DIR/feedback.json")

CLOSED_SINCE=$(date -u -v-90d +%Y-%m-%d 2>/dev/null || date -u -d '90 days ago' +%Y-%m-%d)
{ gh issue list -R "$REPO" --state open --limit 300 --json number,state,title,labels,body
  gh issue list -R "$REPO" --state closed --search "closed:>=$CLOSED_SINCE" --limit 200 --json number,state,title,labels,body
} | jq -s 'add | map({number, state, title, labels: [.labels[].name], body: (.body // "" | .[0:400])})' \
  > "$RUN_DIR/issues.json" || fail "issue fetch failed"
log "issues for dedupe: $(jq length "$RUN_DIR/issues.json")"

# --- 2. Analyze (no tools) ----------------------------------------------------
{ cat "$SCRIPT_DIR/prompt.md"
  printf '\n\n## FEEDBACK\n```json\n'; cat "$RUN_DIR/feedback.json"
  printf '\n```\n\n## ISSUES\n```json\n'; cat "$RUN_DIR/issues.json"; printf '\n```\n'
} > "$RUN_DIR/input.md"

log "analyzing"
(cd "$HOME_DIR" && claude -p --tools "" --strict-mcp-config --no-session-persistence \
  --output-format json --json-schema "$(cat "$SCRIPT_DIR/schema.json")" < "$RUN_DIR/input.md") \
  > "$RUN_DIR/claude.json" || fail "claude run failed"
jq -e '.structured_output' "$RUN_DIR/claude.json" > "$RUN_DIR/plan.json" || fail "no structured plan in claude output"

# --- 3. Validate ----------------------------------------------------------------
PROBLEMS=$(jq -r --argjson ids "$(jq 'map(.id)' "$RUN_DIR/feedback.json")" --argjson allowed "$ALLOWED_LABELS" \
  --argjson max "$MAX_CREATES" -f "$SCRIPT_DIR/validate.jq" "$RUN_DIR/plan.json") || fail "validator error"
if [ -n "$PROBLEMS" ]; then
  echo "$PROBLEMS" > "$RUN_DIR/validation-errors.txt"
  fail "plan rejected ($(echo "$PROBLEMS" | wc -l | tr -d ' ') problems); see $RUN_DIR/validation-errors.txt"
fi
# Comments may only target issues we showed the model.
for n in $(jq -r '.actions[] | select(.type=="comment_issue") | .issue_number' "$RUN_DIR/plan.json"); do
  jq -e --argjson n "$n" 'any(.[]; .number == $n)' "$RUN_DIR/issues.json" >/dev/null || fail "comment targets unknown issue #$n"
done
log "plan valid: $(jq -r '[.actions[] | .type] | group_by(.) | map("\(.[0])=\(length)") | join(" ")' "$RUN_DIR/plan.json")"

# --- 4. Execute -----------------------------------------------------------------
FOOTER_TPL=$'\n\n---\n<sub>Filed by the weekly feedback triage routine from `submit_feedback` records: %s</sub>'
REPORT="$RUN_DIR/report.md"
{ echo "# Feedback triage $(date +%Y-%m-%d)$([ $DRY_RUN = 1 ] && echo ' (dry run)')"; echo
  jq -r '.summary' "$RUN_DIR/plan.json"; echo; echo "## Actions"; } > "$REPORT"

N=$(jq '.actions | length' "$RUN_DIR/plan.json")
for i in $(seq 0 $((N - 1))); do
  A=$(jq -c ".actions[$i]" "$RUN_DIR/plan.json")
  TYPE=$(jq -r .type <<<"$A"); IDS=$(jq -r '.feedback_ids | join(", ")' <<<"$A"); REASON=$(jq -r .reason <<<"$A")
  BODY_FILE="$RUN_DIR/action-$i.md"
  case $TYPE in
    create_issue)
      TITLE=$(jq -r .title <<<"$A")
      { jq -r .body <<<"$A"; printf "$FOOTER_TPL" "$IDS"; } > "$BODY_FILE"
      LABEL_ARGS=(); for l in $(jq -r '.labels[]' <<<"$A"); do LABEL_ARGS+=(--label "$l"); done
      if [ $DRY_RUN = 1 ]; then RESULT="(dry run)"; else
        RESULT=$(gh issue create -R "$REPO" --title "$TITLE" --body-file "$BODY_FILE" "${LABEL_ARGS[@]}") || fail "create failed: $TITLE"
      fi
      echo "- **Created** $TITLE: $RESULT. $REASON" >> "$REPORT" ;;
    comment_issue)
      NUM=$(jq -r .issue_number <<<"$A")
      { jq -r .body <<<"$A"; printf "$FOOTER_TPL" "$IDS"; } > "$BODY_FILE"
      if [ $DRY_RUN = 1 ]; then RESULT="(dry run)"; else
        RESULT=$(gh issue comment "$NUM" -R "$REPO" --body-file "$BODY_FILE") || fail "comment failed on #$NUM"
      fi
      echo "- **Commented** on #$NUM: $RESULT. $REASON" >> "$REPORT" ;;
    skip)
      echo "- **Skipped** $IDS: $REASON" >> "$REPORT" ;;
  esac
  log "$TYPE done"
done

# --- 5. Advance watermark & report ----------------------------------------------
if [ $DRY_RUN = 0 ]; then echo "$NEW_WATERMARK" > "$WATERMARK_FILE"; log "watermark -> $NEW_WATERMARK"; fi
log "report: $REPORT"
notify "$COUNT feedback item(s) triaged$([ $DRY_RUN = 1 ] && echo ' (dry run)'). Report in runs/."

#!/bin/bash
# Tests for the feedback triage routine. Needs only bash, jq and git (runs in CI on ubuntu).
# External tools (supabase, gh, claude, osascript, launchctl) are replaced by stubs; nothing real is called.
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
FX="$DIR/fixtures"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
IDS='["f1","f2","f3"]'
# Use the real allowlist from run.sh so the tests break if it drifts.
ALLOWED=$(sed -n "s/^ALLOWED_LABELS='\(.*\)'$/\1/p" "$DIR/run.sh")
[ -n "$ALLOWED" ] || { echo "could not read ALLOWED_LABELS from run.sh"; exit 1; }
ISSUES=$(jq -c 'map({number, author, labels})' "$FX/issues.json")
MAX=10
PASS=0; FAIL=0

ok() { PASS=$((PASS + 1)); echo "ok   $1"; }
ko() { FAIL=$((FAIL + 1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/     /'; return 0; }
check() { if eval "$2"; then ok "$1"; else ko "$1" "${3:-}"; fi; }

# --- validate.jq ----------------------------------------------------------------
validate_file() {
  jq -r --argjson ids "$IDS" --argjson allowed "$ALLOWED" --argjson max "$MAX" \
    --argjson issues "$ISSUES" --arg maintainer dtun -f "$DIR/validate.jq" "$1"
}
# Fixture name, or "jq:<expr>" applied to valid.json (with $text bound to $3 when given).
plan_for() {
  case $1 in
    jq:*) jq --arg text "${2:-}" "${1#jq:}" "$FX/valid.json" > "$TMP/plan.json"; echo "$TMP/plan.json" ;;
    *) echo "$FX/$1.json" ;;
  esac
}
expect_valid() {
  local out; out=$(validate_file "$(plan_for "$1" "${2:-}")")
  if [ -z "$out" ]; then ok "$1 ${2:-}: no problems"; else ko "$1 ${2:-}: expected no problems" "$out"; fi
}
expect_problem() {
  local out; out=$(validate_file "$(plan_for "$1" "${3:-}")")
  if printf '%s\n' "$out" | grep -qF -- "$2"; then ok "$1 ${3:-}: '$2'"; else ko "$1 ${3:-}: expected '$2'" "$out"; fi
}
expect_no_problem() {
  local out; out=$(validate_file "$(plan_for "$1" "${3:-}")")
  if printf '%s\n' "$out" | grep -qF -- "$2"; then ko "$1 ${3:-}: unexpected '$2'" "$out"; else ok "$1 ${3:-}: no '$2'"; fi
}
BODY='jq:.actions[0].body += "\n" + $text'

expect_valid valid
expect_problem unaccounted "unaccounted feedback: f3"
expect_problem unknown-id "unknown feedback ids: f9"
expect_problem disallowed-label "disallowed labels priority-high on:"
expect_problem ready-for-agent "disallowed labels ready-for-agent on:"
expect_problem missing-feedback-label "missing required labels:"
expect_problem missing-triage-label "missing required labels:"
expect_problem bad-title "bad title: Add custom quantities"
expect_problem 'jq:.actions[0].title = "feat(mobile): something\nmore"' "bad title:"
expect_problem 'jq:.actions[0].title = "feat(mobile): trailing newline\n"' "bad title:"
expect_problem empty-body "empty body:"
expect_problem email "possible personal info in: feat(mcp-server)"
expect_no_problem email "@-mention"
expect_problem uuid "possible personal info in: comment #12"
expect_problem phone "possible personal info in: feat(mcp-server)"
expect_problem too-many-creates "too many issues: 11 > 10"
expect_problem comment-no-number "comment without issue_number"

# Caps: non-skip actions overall, comments, one comment per issue.
expect_problem 'jq:. as $p | .actions = ([range(9) | $p.actions[0]] + [.actions[1], (.actions[1] | .issue_number = 30), .actions[2]])' \
  "too many actions: 11 > 10"
expect_no_problem 'jq:. as $p | .actions = ([range(9) | $p.actions[0]] + [.actions[1], (.actions[1] | .issue_number = 30), .actions[2]])' \
  "too many issues"
expect_problem 'jq:. as $p | .actions = ([range(11) | $p.actions[1]] + [.actions[0], .actions[2]])' "too many comments: 11 > 10"
expect_problem 'jq:.actions += [.actions[1]]' "multiple comments on #12"
# Comment targets: must be in ISSUES and opened by the maintainer or carry the feedback label.
expect_problem 'jq:.actions[1].issue_number = 99' "comment targets unknown issue #99"
expect_problem 'jq:.actions[1].issue_number = 20' "comment target #20 not opened by the maintainer or the routine"
expect_valid 'jq:.actions[1].issue_number = 30'
# Mentions, cross-repo refs, URLs, unknown #N refs.
expect_problem "$BODY" "@-mention in:" "thanks @octocat"
expect_problem "$BODY" "@-mention in:" "cc @some-team"
expect_problem 'jq:.actions[1].body += "\n@dtun please look"' "@-mention in: comment #12"
expect_problem "$BODY" "cross-repo reference in:" "see other/repo#4"
expect_problem "$BODY" "url in:" "see https://evil.example/login"
expect_problem "$BODY" "url in:" "visit www.evil.example"
expect_problem 'jq:.actions[0].title = "feat(mobile): see http://x.example"' "url in:"
expect_problem "$BODY" "unknown issue reference #77 in:" "Related to #77"
expect_valid "$BODY" "Follow-up to #5, related to #12"
# Phone numbers: common formats are flagged; years, dates and quantities are not.
for p in "555 123 4567" "5551234567" "+1 555 123 4567" "(555) 123-4567" "555.123.4567" "+44 20 7946 0958"; do
  expect_problem "$BODY" "possible personal info in:" "call $p"
done
for t in "since 2025 and in 2026" "on 2026-10-10" "1000 liters for 12 people" "10 20 30 40 units" \
  "household of 4, 3 gallons per day for 14 days" "about 250 000 calories"; do
  expect_no_problem "$BODY" "possible personal info" "$t"
done

# --- alias.jq -------------------------------------------------------------------
ALIASED=$(jq -c -f "$DIR/alias.jq" "$FX/feedback.raw.json")
if jq -e 'all(.[]; has("user_id") | not)' <<<"$ALIASED" >/dev/null && ! grep -q 'user_id\|bbbbbbbb\|aaaaaaaa' <<<"$ALIASED"; then
  ok "alias: no user_id in output"
else ko "alias: user_id leaked" "$ALIASED"; fi
if [ "$(jq -c 'map(.reporter)' <<<"$ALIASED")" = '["r2","r1","r2"]' ]; then
  ok "alias: stable per-user aliases"
else ko "alias: unexpected aliases" "$(jq -c 'map(.reporter)' <<<"$ALIASED")"; fi
if [ "$(jq -c -f "$DIR/alias.jq" "$FX/feedback.raw.json")" = "$ALIASED" ]; then
  ok "alias: deterministic across runs"
else ko "alias: output differs between runs"; fi

# --- watermark ------------------------------------------------------------------
# Regex taken from run.sh and matched the same way; it gates what gets interpolated into SQL.
TS_RE=$(sed -n "s/^TIMESTAMP_RE='\(.*\)'$/\1/p" "$DIR/run.sh")
[ -n "$TS_RE" ] || { echo "could not read TIMESTAMP_RE from run.sh"; exit 1; }
for ts in "1970-01-01T00:00:00Z" "2026-10-10T19:07:28.514000Z" "2026-10-10 19:07:28.514+00" \
  "2026-10-10 19:07:28+00:00" "2026-10-10T19:07:28-0700"; do
  if [[ $ts =~ $TS_RE ]]; then ok "timestamp accepted: $ts"; else ko "timestamp rejected: $ts"; fi
done
for ts in "" "2026-10-10" "2026-10-10T19:07:28" "2026-10-10T19:07:28Z' or '1'='1" \
  "2026-10-10T19:07:28Z; drop table feedback" "2026-10-10T19:07:28.1234567Z" $'2026-10-10T19:07:28Z\nx'; do
  if [[ $ts =~ $TS_RE ]]; then ko "timestamp accepted: $ts"; else ok "timestamp rejected: $(printf '%q' "$ts")"; fi
done
# run.sh selects created_at as fixed-width UTC microseconds, so string max() is the chronological max.
W=$(jq -rn '["2026-10-10T19:07:28.500000Z","2026-10-10T19:07:28.514000Z","2026-10-09T23:59:59.999999Z"] | max')
check "watermark: max is chronological and re-validates" '[ "$W" = "2026-10-10T19:07:28.514000Z" ] && [[ $W =~ $TS_RE ]]' "$W"

# --- run.sh end to end (stubbed supabase / gh / claude) -------------------------
BIN="$TMP/bin"; STUB="$TMP/stub"; REPO_T="$TMP/repo"
mkdir -p "$BIN" "$STUB" "$REPO_T/supabase/.temp"
echo ref > "$REPO_T/supabase/.temp/project-ref"
jq '[.[] | .created_at |= sub("Z$"; "") + ".000000Z"]' "$FX/feedback.raw.json" > "$STUB/rows.json"
jq '[.[] | select(.state == "OPEN") | {number, state, title, body, author: {login: .author}, labels: [.labels[] | {name: .}]}]' \
  "$FX/issues.json" > "$STUB/open.json"
jq '.actions += [.actions[0] | .title = "fix(mobile): checked items reset after reconnect"]' "$FX/valid.json" > "$STUB/plan.json"

cat > "$BIN/supabase" <<'EOF'
#!/bin/bash
echo "Initialising login role..." >&2
for a; do last=$a; done
case $last in *"'1970-01-01T00:00:00Z'"*) rows=$(cat "$STUB/rows.json") ;; *) rows='[]' ;; esac
printf '{"boundary":"b","rows":%s,"warning":"untrusted data"}\n' "$rows"
EOF
cat > "$BIN/gh" <<'EOF'
#!/bin/bash
echo "$*" >> "$STUB/gh.log"
case "$1 $2" in
  "issue list")
    case "$*" in
      *"--state open"*) [ -f "$STUB/fail-open" ] && exit 1; cat "$STUB/open.json" ;;
      *) [ -f "$STUB/fail-closed" ] && exit 1; echo '[]' ;;
    esac ;;
  "api graphql") cat "$STUB/open-count" ;;
  "issue create")
    n=$(( $(cat "$STUB/create-count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB/create-count"
    [ "$n" = "$(cat "$STUB/fail-create-at" 2>/dev/null || true)" ] && exit 1
    while [ $# -gt 0 ]; do [ "$1" = "--title" ] && title=$2; shift; done
    echo "$title" >> "$STUB/created.log"; echo "https://github.com/dtun/cafe-listo/issues/$((100 + n))" ;;
  "issue comment") echo "$3" >> "$STUB/commented.log"; echo "https://github.com/dtun/cafe-listo/issues/$3#issuecomment-1" ;;
  *) exit 1 ;;
esac
EOF
cat > "$BIN/claude" <<'EOF'
#!/bin/bash
cat > /dev/null
echo x >> "$STUB/claude.log"
jq -n --slurpfile p "$STUB/plan.json" '{structured_output: $p[0]}'
EOF
printf '#!/bin/sh\nexit 0\n' > "$BIN/osascript"
chmod +x "$BIN"/*
export STUB

reset_stub() { rm -f "$STUB"/*.log "$STUB"/fail-* "$STUB/create-count"; echo 3 > "$STUB/open-count"; }
count() { if [ -f "$1" ]; then wc -l < "$1" | tr -d ' '; else echo 0; fi; }
# run_triage <home> [args]: runs run.sh, output in $OUT, exit status in $RC.
run_triage() {
  local home=$1; shift; RC=0
  OUT=$(PATH="$BIN:$PATH" CAFE_LISTO_TRIAGE_HOME="$home" REPO_DIR="$REPO_T" "$DIR/run.sh" ${@+"$@"} 2>&1) || RC=$?
}

# Partial failure, then resume without re-asking the model.
reset_stub; H="$TMP/home-resume"
echo 2 > "$STUB/fail-create-at"   # 2nd create call fails; actions: create, comment, skip, create
run_triage "$H"
check "resume: first run fails on the 2nd create" '[ "$RC" != 0 ] && grep -q "next run resumes" <<<"$OUT"' "$OUT"
check "resume: plan recorded as pending" '[ -f "$H/state/pending" ]'
check "resume: watermark not advanced" '[ ! -f "$H/state/watermark" ]'
PLAN_DIR=$(cat "$H/state/pending" 2>/dev/null || true)
check "resume: 3 actions recorded done" '[ "$(count "$PLAN_DIR/actions.done")" = 3 ]' "$(cat "$PLAN_DIR/actions.done" 2>/dev/null)"
check "resume: done entries carry index and result" 'grep -q "^0	https://github.com/dtun/cafe-listo/issues/101$" "$PLAN_DIR/actions.done"'
rm -f "$STUB/fail-create-at"
run_triage "$H"
check "resume: second run succeeds" '[ "$RC" = 0 ]' "$OUT"
check "resume: model asked only once" '[ "$(count "$STUB/claude.log")" = 1 ]'
check "resume: each issue created once" '[ "$(count "$STUB/created.log")" = 2 ] && [ "$(sort "$STUB/created.log" | uniq -d)" = "" ]' \
  "$(cat "$STUB/created.log")"
check "resume: comment posted once" '[ "$(count "$STUB/commented.log")" = 1 ]'
check "resume: all 4 actions done" '[ "$(count "$PLAN_DIR/actions.done")" = 4 ]'
check "resume: pending cleared" '[ ! -f "$H/state/pending" ]'
check "resume: watermark advanced to batch max" '[ "$(cat "$H/state/watermark")" = "2026-10-03T10:00:00.000000Z" ]'
check "resume: fresh run follows and finds nothing new" 'grep -q "nothing to do" <<<"$OUT"' "$OUT"
check "resume: no user_id reached the model input" '! grep -rq "user_id\|aaaaaaaa\|bbbbbbbb" "$PLAN_DIR/input.md" "$PLAN_DIR/feedback.json"'

# Dry run with a pending plan changes nothing.
reset_stub; H="$TMP/home-dry"; echo 2 > "$STUB/fail-create-at"
run_triage "$H"; rm -f "$STUB/fail-create-at"
run_triage "$H" --dry-run
check "dry run: reports pending plan, files nothing" '[ "$RC" = 0 ] && grep -q "unfinished plan" <<<"$OUT" && [ -f "$H/state/pending" ] && [ "$(count "$STUB/created.log")" = 1 ]' "$OUT"

# Issue fetch failures stop the run before the model is asked.
reset_stub; touch "$STUB/fail-open"; run_triage "$TMP/home-f1"
check "fetch: open issue list failure is fatal" '[ "$RC" != 0 ] && grep -q "open issue fetch failed" <<<"$OUT" && [ "$(count "$STUB/claude.log")" = 0 ]' "$OUT"
reset_stub; touch "$STUB/fail-closed"; run_triage "$TMP/home-f2"
check "fetch: closed issue list failure is fatal" '[ "$RC" != 0 ] && grep -q "closed issue fetch failed" <<<"$OUT" && [ "$(count "$STUB/claude.log")" = 0 ]' "$OUT"
reset_stub; echo 5 > "$STUB/open-count"; run_triage "$TMP/home-f3"
check "fetch: incomplete open list is fatal" '[ "$RC" != 0 ] && grep -q "open issue list incomplete (3 of 5)" <<<"$OUT"' "$OUT"
reset_stub; echo '[]' > "$STUB/open.empty"; cp "$STUB/open.json" "$STUB/open.keep"; cp "$STUB/open.empty" "$STUB/open.json"
run_triage "$TMP/home-f4"; cp "$STUB/open.keep" "$STUB/open.json"
check "fetch: empty open list with open issues is fatal" '[ "$RC" != 0 ] && grep -q "open issue list incomplete (0 of 3)" <<<"$OUT"' "$OUT"

# --- install.sh -----------------------------------------------------------------
G="git -c user.email=t@example.com -c user.name=t -c init.defaultBranch=main"
MAIN="$TMP/main"; WT="$TMP/wt"
mkdir -p "$MAIN/ops"
cp -R "$DIR" "$MAIN/ops/feedback-triage"
$G init -q "$MAIN"; $G -C "$MAIN" add -A; $G -C "$MAIN" commit -qm init; $G -C "$MAIN" worktree add -q "$WT"
$G init -q --bare "$TMP/origin.git"; $G -C "$MAIN" remote add origin "$TMP/origin.git"; $G -C "$MAIN" push -q origin HEAD:main
MAIN_REAL=$(cd "$MAIN" && pwd -P)
IH="$TMP/install-home"; IA="$TMP/install-agents"
RC=0; OUT=$(CAFE_LISTO_TRIAGE_HOME="$IH" LAUNCH_AGENTS_DIR="$IA" bash "$WT/ops/feedback-triage/install.sh" --no-load 2>&1) || RC=$?
check "install: fails without a supabase link" '[ "$RC" != 0 ] && grep -q "supabase link" <<<"$OUT"' "$OUT"
mkdir -p "$MAIN/supabase/.temp"; echo ref > "$MAIN/supabase/.temp/project-ref"
RC=0; OUT=$(CAFE_LISTO_TRIAGE_HOME="$IH" LAUNCH_AGENTS_DIR="$IA" bash "$WT/ops/feedback-triage/install.sh" --no-load 2>&1) || RC=$?
check "install: --no-load from a worktree succeeds" '[ "$RC" = 0 ]' "$OUT"
check "install: REPO_DIR is the main checkout, not the worktree" 'grep -qx "REPO_DIR=\"$MAIN_REAL\"" "$IH/config.env"' "$(cat "$IH/config.env" 2>/dev/null)"
check "install: launcher points at the main checkout" 'grep -q "REPO_DIR=\"$MAIN_REAL\"" "$IH/launch.sh"'

# The launcher, invoked with no args as launchd does, runs run.sh exported from origin/main.
reset_stub
if [ "$(PATH="$BIN:$PATH" command -v gh)" = "$BIN/gh" ] && [ "$(PATH="$BIN:$PATH" command -v claude)" = "$BIN/claude" ]; then
  RC=0; OUT=$(PATH="$BIN:$PATH" bash "$IH/launch.sh" 2>&1) || RC=$?
  check "launcher: no-arg run from origin/main succeeds" '[ "$RC" = 0 ] && [ "$(count "$STUB/created.log")" = 2 ] && [ -f "$IH/state/watermark" ]' "$OUT"
else
  ko "launcher: stubs not first on PATH; skipped"
fi

LBIN="$TMP/lbin"; mkdir -p "$LBIN"
cat > "$LBIN/launchctl" <<'EOF'
#!/bin/bash
echo "$1" >> "$STUB/launchctl.log"
if [ "$1" = bootstrap ]; then
  n=$(( $(cat "$STUB/bootstrap-count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB/bootstrap-count"
  [ "$n" -ge 2 ] || { echo "Bootstrap failed: 5: Input/output error" >&2; exit 5; }
fi
exit 0
EOF
chmod +x "$LBIN/launchctl"
if [ "$(PATH="$LBIN:$PATH" command -v launchctl)" = "$LBIN/launchctl" ]; then
  RC=0; OUT=$(PATH="$LBIN:$PATH" CAFE_LISTO_TRIAGE_HOME="$IH" LAUNCH_AGENTS_DIR="$IA" bash "$WT/ops/feedback-triage/install.sh" 2>&1) || RC=$?
  check "install: retries bootstrap after an I/O error" '[ "$RC" = 0 ] && [ "$(grep -c bootstrap "$STUB/launchctl.log")" = 2 ] && grep -q bootout "$STUB/launchctl.log"' "$OUT"
else
  ko "install: launchctl stub not first on PATH; skipped bootstrap test"
fi

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]

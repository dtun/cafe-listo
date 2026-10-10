#!/bin/bash
# Tests for validate.jq and alias.jq. Needs only bash and jq (runs in CI on ubuntu).
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
FX="$DIR/fixtures"
IDS='["f1","f2","f3"]'
# Use the real allowlist from run.sh so the tests break if it drifts.
ALLOWED=$(sed -n "s/^ALLOWED_LABELS='\(.*\)'$/\1/p" "$DIR/run.sh")
[ -n "$ALLOWED" ] || { echo "could not read ALLOWED_LABELS from run.sh"; exit 1; }
MAX=10
PASS=0; FAIL=0

validate() { jq -r --argjson ids "$IDS" --argjson allowed "$ALLOWED" --argjson max "$MAX" -f "$DIR/validate.jq" "$FX/$1.json"; }
ok() { PASS=$((PASS + 1)); echo "ok   $1"; }
ko() { FAIL=$((FAIL + 1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "$2" | sed 's/^/     /'; return 0; }

expect_valid() {
  local out; out=$(validate "$1")
  if [ -z "$out" ]; then ok "$1: no problems"; else ko "$1: expected no problems" "$out"; fi
}
expect_problem() {
  local out; out=$(validate "$1")
  if printf '%s\n' "$out" | grep -qF -- "$2"; then ok "$1: '$2'"; else ko "$1: expected '$2'" "$out"; fi
}

expect_valid valid
expect_problem unaccounted "unaccounted feedback: f3"
expect_problem unknown-id "unknown feedback ids: f9"
expect_problem disallowed-label "disallowed labels priority-high on:"
expect_problem ready-for-agent "disallowed labels ready-for-agent on:"
expect_problem missing-feedback-label "missing required labels:"
expect_problem missing-triage-label "missing required labels:"
expect_problem bad-title "bad title: Add custom quantities"
expect_problem empty-body "empty body:"
expect_problem email "possible personal info in: feat(mcp-server)"
expect_problem uuid "possible personal info in: comment #12"
expect_problem phone "possible personal info in: feat(mcp-server)"
expect_problem too-many-creates "too many issues: 11 > 10"
expect_problem comment-no-number "comment without issue_number"

# Aliasing: no user_id survives, aliases are stable and shared per user.
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

# Watermark regex (taken from run.sh, matched the same way): it gates what gets interpolated into SQL.
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
if [ "$W" = "2026-10-10T19:07:28.514000Z" ] && [[ $W =~ $TS_RE ]]; then ok "watermark: max is chronological and re-validates"
else ko "watermark: got $W"; fi

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]

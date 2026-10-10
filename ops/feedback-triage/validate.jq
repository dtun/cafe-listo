# Validates a triage plan. Prints one problem per line; no output means the plan is valid.
# Usage: jq -r --argjson ids '<feedback ids>' --argjson allowed '<label allowlist>' --argjson max <N> -f validate.jq plan.json
def pii:
  test("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
  or test("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
  or test("\\b\\d{3}[-. )]\\s?\\d{3}[-.]\\d{4}\\b");

.actions as $a
| [ ($ids - ([$a[].feedback_ids[]] | unique) | if length > 0 then "unaccounted feedback: \(join(","))" else empty end),
    ([$a[].feedback_ids[]] - $ids | if length > 0 then "unknown feedback ids: \(join(","))" else empty end),
    ([$a[] | select(.type == "create_issue")] | if length > $max then "too many issues: \(length) > \($max)" else empty end),
    ($a[] | select(.type == "create_issue") |
      (if (.title // "" | test("^(feat|fix|docs)\\((mcp-server|shared|mobile|landing|db)\\): .{5,}$")) then empty else "bad title: \(.title)" end),
      (if (.body // "") == "" then "empty body: \(.title)" else empty end),
      (if ((.labels // []) | index("feedback")) and ((.labels // []) | index("needs-triage")) then empty else "missing required labels: \(.title)" end),
      (.title as $t | ((.labels // []) - $allowed) | if length > 0 then "disallowed labels \(join(",")) on: \($t)" else empty end)),
    ($a[] | select(.type == "comment_issue") |
      (if .issue_number == null then "comment without issue_number" else empty end),
      (if (.body // "") == "" then "empty comment on #\(.issue_number)" else empty end)),
    ($a[] | select(.type != "skip") | select(((.title // "") + " " + (.body // "")) | pii) | "possible personal info in: \(.title // ("comment #" + (.issue_number|tostring)))")
  ]
| .[]

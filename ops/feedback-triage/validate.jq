# Validates a triage plan. Prints one problem per line; no output means the plan is valid.
# Usage: jq -r --argjson ids '<feedback ids>' --argjson allowed '<label allowlist>' --argjson max <N> \
#          --argjson issues '[{number, author, labels}]' --arg maintainer <login> -f validate.jq plan.json
# $max caps non-skip actions overall, and creates and comments separately.

def phone_re:
  "(?<![0-9])(?:(?:\\+[0-9]{1,3}[\\s.-]?)?\\(?[0-9]{3}\\)?[\\s.-]?[0-9]{3}[\\s.-]?[0-9]{4}|\\+[0-9]{1,3}(?:[\\s.-]?[0-9]{2,4}){2,5})(?![0-9])";
def pii:
  test("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
  or test("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
  or test(phone_re);
def name: if .type == "create_issue" then (.title // "") else "comment #\(.issue_number)" end;
def text: (.title // "") + "\n" + (.body // "");
# Plain #N references (not headings, not owner/repo#N, not &#N; entities).
def issue_refs: [scan("(?<![A-Za-z0-9_/&#])#([0-9]+)") | .[0] | tonumber];

.actions as $a
| ($issues | map(.number)) as $known
| [$a[] | select(.type == "create_issue")] as $creates
| [$a[] | select(.type == "comment_issue")] as $comments
| [ ($ids - ([$a[].feedback_ids[]] | unique) | if length > 0 then "unaccounted feedback: \(join(","))" else empty end),
    ([$a[].feedback_ids[]] - $ids | if length > 0 then "unknown feedback ids: \(join(","))" else empty end),
    ([$a[] | select(.type != "skip")] | if length > $max then "too many actions: \(length) > \($max)" else empty end),
    ($creates | if length > $max then "too many issues: \(length) > \($max)" else empty end),
    ($comments | if length > $max then "too many comments: \(length) > \($max)" else empty end),
    ($creates[] |
      (if (.title // "" | test("\\A(feat|fix|docs)\\((mcp-server|shared|mobile|landing|db)\\): [^\\n]{5,}\\z")) then empty else "bad title: \(.title)" end),
      (if (.body // "") == "" then "empty body: \(.title)" else empty end),
      (if ((.labels // []) | index("feedback")) and ((.labels // []) | index("needs-triage")) then empty else "missing required labels: \(.title)" end),
      (.title as $t | ((.labels // []) - $allowed) | if length > 0 then "disallowed labels \(join(",")) on: \($t)" else empty end)),
    ($comments[] |
      (if .issue_number == null then "comment without issue_number" else empty end),
      (if (.body // "") == "" then "empty comment on #\(.issue_number)" else empty end),
      (.issue_number as $n | ($issues | map(select(.number == $n)) | first) as $target
        | if $n == null then empty
          elif $target == null then "comment targets unknown issue #\($n)"
          elif $target.author == $maintainer or ($target.labels // [] | index("feedback")) then empty
          else "comment target #\($n) not opened by the maintainer or the routine" end)),
    ($comments | map(.issue_number) | group_by(.) | map(select(length > 1) | "multiple comments on #\(.[0])") | .[]),
    ($a[] | select(.type != "skip") | name as $name | text |
      (if pii then "possible personal info in: \($name)" else empty end),
      (if test("(^|[^A-Za-z0-9_.+-])@[A-Za-z0-9-]") then "@-mention in: \($name)" else empty end),
      (if test("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]") then "cross-repo reference in: \($name)" else empty end),
      (if test("https?://|www\\."; "i") then "url in: \($name)" else empty end),
      ((issue_refs - $known | unique) | if length > 0 then "unknown issue reference \(map("#\(.)") | join(",")) in: \($name)" else empty end))
  ]
| .[]

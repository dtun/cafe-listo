# Café Listo: domain glossary

Terms as the code and docs use them.

## Feedback loop

**Feedback**: a record a user submits, with consent, through the MCP server's `submit_feedback` tool. Stored in `public.feedback`, write-only for users. Its `kind` is one of gap, bug, content_error, idea or other (`FeedbackKind` in `packages/shared`).

**Reporter alias**: a per-run stand-in (`r1`, `r2`, ...) for a feedback row's user id. It is assigned before anything else sees the batch, so raw user ids never reach the analyzer or GitHub.

**Triage plan**: the analyzer's proposal for one batch of feedback, made of a summary and a list of triage actions. The plan only counts once `validatePlan` returns no problems, and a single problem rejects the whole plan.

**Triage action**: one step of a plan: `create_issue` (labelled `feedback` and `needs-triage`), `comment_issue` on an existing issue, or `skip` with a reason. Every feedback id appears in at least one action.

**Triage policy**: the limits a plan is validated against: allowed and required labels, caps on actions and comments, trusted authors whose issues may get comments, and the title pattern and scopes.

**Triage ledger**: the loop's durable state: the cursor plus at most one pending plan, with the actions already done. A failed run resumes its pending plan and never asks the model again.

**Cursor**: the `created_at` of the newest feedback already triaged, stored as fixed-width UTC with microseconds. It moves only after every action in a plan has succeeded.

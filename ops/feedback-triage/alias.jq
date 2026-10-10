# Replaces user_id with a per-run alias (r1, r2, ...) so raw ids never reach the model.
(map(.user_id) | unique) as $u
| map(.user_id as $id | . + {reporter: ("r" + (($u | index($id)) + 1 | tostring))} | del(.user_id))

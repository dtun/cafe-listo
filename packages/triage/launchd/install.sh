#!/bin/bash
# Installs the weekly triage launchd agent (Saturdays 08:07 local) and its launcher.
# Usage: install.sh [--no-load | --uninstall]
#   --no-load    write the launcher and plist but don't (re)load the agent
#   --uninstall  unload and remove the agent and launcher; keeps state (cursor, pending plan, checkout)
# Env: TRIAGE_STATE_DIR (default ~/.cafe-listo/triage), LAUNCH_AGENTS_DIR (default ~/Library/LaunchAgents).
# A custom LAUNCH_AGENTS_DIR (tests) only gets files: launchctl is never called for it.
set -euo pipefail

LABEL="com.cafe-listo.triage"
SRC_DIR=$(cd "$(dirname "$0")" && pwd)
# The main checkout even when run from a worktree: worktrees lack the supabase link and may vanish.
REPO_DIR=$(dirname "$(git -C "$SRC_DIR" rev-parse --path-format=absolute --git-common-dir)")
STATE_DIR="${TRIAGE_STATE_DIR:-$HOME/.cafe-listo/triage}"
AGENTS_DIR="${LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
PLIST="$AGENTS_DIR/$LABEL.plist"
DOMAIN="gui/$(id -u)"

MODE=install
case "${1:-}" in
  "") ;;
  --no-load) MODE=no-load ;;
  --uninstall) MODE=uninstall ;;
  *) echo "usage: $0 [--no-load | --uninstall]" >&2; exit 2 ;;
esac

[ -z "${LAUNCH_AGENTS_DIR:-}" ] || [ "$MODE" = uninstall ] || MODE=no-load
unload() { [ -n "${LAUNCH_AGENTS_DIR:-}" ] || launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true; }

if [ "$MODE" = uninstall ]; then
  unload
  rm -f "$PLIST" "$STATE_DIR/launch.sh"
  echo "uninstalled $LABEL (kept $STATE_DIR)"
  exit 0
fi

[ -f "$REPO_DIR/supabase/.temp/project-ref" ] \
  || { echo "no linked Supabase project in $REPO_DIR; run supabase link there first" >&2; exit 1; }
for path in "$REPO_DIR" "$STATE_DIR"; do
  case "$path" in *[\|\&\<\>\"\\]*) echo "unsupported character in path: $path" >&2; exit 1 ;; esac
done

render() { sed -e "s|@@STATE_DIR@@|$STATE_DIR|g" -e "s|@@REPO_DIR@@|$REPO_DIR|g" "$1"; }

mkdir -p "$STATE_DIR" "$AGENTS_DIR"
chmod 700 "$STATE_DIR"
render "$SRC_DIR/launch.sh.template" > "$STATE_DIR/launch.sh"
chmod 755 "$STATE_DIR/launch.sh"
render "$SRC_DIR/$LABEL.plist.template" > "$PLIST"
echo "wrote $STATE_DIR/launch.sh and $PLIST (REPO_DIR=$REPO_DIR)"

if [ "$MODE" = install ]; then
  unload
  # bootstrap right after bootout can fail with "5: Input/output error" while launchd tears down.
  for attempt in 1 2 3 4 5; do
    if launchctl bootstrap "$DOMAIN" "$PLIST"; then echo "loaded $LABEL into $DOMAIN"; exit 0; fi
    echo "bootstrap attempt $attempt failed; retrying" >&2
    sleep 1
  done
  echo "could not load $LABEL" >&2
  exit 1
fi

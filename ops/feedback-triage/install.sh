#!/bin/bash
# Installs the local half of the feedback triage routine: a launcher and a launchd agent.
# Everything else (runner, prompt, schema, validator) is fetched from origin/main at run time.
# Usage: install.sh [--no-load | --uninstall]
#   --no-load    write files but don't (re)load the launchd agent
#   --uninstall  unload and remove the agent and launcher; keeps state/, runs/ and config.env
# Env: CAFE_LISTO_TRIAGE_HOME (default ~/.cafe-listo/feedback-triage),
#      LAUNCH_AGENTS_DIR (default ~/Library/LaunchAgents)
set -euo pipefail

LABEL="com.cafe-listo.feedback-triage"
SRC_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SRC_DIR/../.." && pwd)
TRIAGE_HOME="${CAFE_LISTO_TRIAGE_HOME:-$HOME/.cafe-listo/feedback-triage}"
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

unload() { launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true; }

if [ "$MODE" = uninstall ]; then
  unload
  rm -f "$PLIST" "$TRIAGE_HOME/launch.sh"
  echo "uninstalled $LABEL (kept $TRIAGE_HOME state/, runs/, config.env)"
  exit 0
fi

render() { sed -e "s|@@TRIAGE_HOME@@|$TRIAGE_HOME|g" -e "s|@@REPO_DIR@@|$REPO_DIR|g" "$1"; }

mkdir -p "$TRIAGE_HOME/state" "$TRIAGE_HOME/runs" "$AGENTS_DIR"
render "$SRC_DIR/launch.sh.template" > "$TRIAGE_HOME/launch.sh"
chmod 755 "$TRIAGE_HOME/launch.sh"

if [ ! -f "$TRIAGE_HOME/config.env" ]; then
  cat > "$TRIAGE_HOME/config.env" <<EOF
# Local config for the feedback triage routine (sourced by run.sh). Not in git.
REPO_DIR="$REPO_DIR"
REPO="dtun/cafe-listo"
ENV_FILE="\$REPO_DIR/packages/mcp-server/.env"
EOF
  echo "wrote $TRIAGE_HOME/config.env"
fi

render "$SRC_DIR/$LABEL.plist.template" > "$PLIST"
echo "wrote $TRIAGE_HOME/launch.sh and $PLIST"

if [ "$MODE" = install ]; then
  unload
  launchctl bootstrap "$DOMAIN" "$PLIST"
  echo "loaded $LABEL into $DOMAIN"
fi

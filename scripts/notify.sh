#!/usr/bin/env bash
# notify.sh — Claude Code hook dispatcher.
#
# Reads hook JSON from stdin, normalizes it, and fans out to every enabled
# channel for the given event. Designed to never block Claude Code:
#  - All channel calls run in parallel and time-bound (5s).
#  - All errors swallow + log — Claude continues even if Slack is down.
#
# Usage (from hooks.json):
#   ${CLAUDE_PLUGIN_ROOT}/scripts/notify.sh <event-name>

set -uo pipefail

# Exit fast if jq is missing — we depend on it everywhere.
if ! command -v jq >/dev/null 2>&1; then
  echo "claude-notifications: jq not found, skipping" >&2
  exit 0
fi

EVENT="${1:-unknown}"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
export CLAUDE_PLUGIN_ROOT="$ROOT"

# Read stdin JSON (Claude Code provides it). Empty when invoked manually.
if [ -t 0 ]; then
  CN_PAYLOAD='{}'
else
  CN_PAYLOAD=$(cat)
fi
[ -z "$CN_PAYLOAD" ] && CN_PAYLOAD='{}'
export CN_PAYLOAD

# shellcheck source=lib/config.sh
. "$ROOT/scripts/lib/config.sh"
# shellcheck source=lib/format.sh
. "$ROOT/scripts/lib/format.sh"

cn_format_event "$EVENT"
cn_log "event=$EVENT title=\"$CN_TITLE\" project=$CN_PROJECT"

# Determine which channels apply to this event.
# CN_FORCE_CHANNELS lets manual sends bypass routing (comma-separated list).
channels=()
if [ -n "${CN_FORCE_CHANNELS:-}" ]; then
  IFS=',' read -ra channels <<< "$CN_FORCE_CHANNELS"
else
  while IFS= read -r _ch; do
    [ -n "$_ch" ] && channels+=("$_ch")
  done < <(cn_channels_for_event "$EVENT")
fi

if [ "${#channels[@]}" -eq 0 ]; then
  cn_log "no channels enabled for $EVENT"
  exit 0
fi

dispatch_channel() {
  local ch="$1"
  local script="$ROOT/scripts/channels/${ch}.sh"
  if [ ! -x "$script" ] && [ -f "$script" ]; then
    chmod +x "$script" 2>/dev/null || true
  fi
  if [ ! -f "$script" ]; then
    # Custom channel: look in user channels dir.
    script="${HOME}/.claude-notifications/channels/${ch}.sh"
  fi
  if [ ! -f "$script" ]; then
    cn_log "channel '$ch' has no handler"
    return 0
  fi
  # Time-bound; never let a slow channel block Claude.
  # shellcheck disable=SC2154  # cn_log_file is exported from lib/config.sh
  if command -v timeout >/dev/null 2>&1; then
    timeout 5 bash "$script" 2>>"$cn_log_file" || cn_log "channel '$ch' failed (rc=$?)"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 5 bash "$script" 2>>"$cn_log_file" || cn_log "channel '$ch' failed (rc=$?)"
  else
    bash "$script" 2>>"$cn_log_file" || cn_log "channel '$ch' failed (rc=$?)"
  fi
}

for ch in "${channels[@]}"; do
  [ -z "$ch" ] && continue
  dispatch_channel "$ch" &
done
wait

exit 0

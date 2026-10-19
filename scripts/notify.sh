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

EVENT="${1:-unknown}"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
export CLAUDE_PLUGIN_ROOT="$ROOT"

# Fast path. Pre/PostToolUse fire on every tool call, and on Windows (Git
# Bash) each fork costs tens of milliseconds, so jq + sourcing the helpers
# took seconds even when nothing was routed. A full run leaves a routing
# cache listing the events with no channels; while no config file is newer
# than it, those events exit here using builtins only (no jq, no cat, no
# subshell). CN_NO_CACHE=1 turns the cache off.
cn_cache_file="${HOME}/.claude-notifications/cache/routing"
cn_cache_sig=""
cn_cache_stale=1
for _f in "$ROOT/config/default.json"           "${HOME}/.claude-notifications/config.json"           "${CLAUDE_PROJECT_DIR:-$PWD}/.claude-notifications.json"           "${CLAUDE_NOTIFICATIONS_CONFIG:-}"; do
  [ -n "$_f" ] && [ -f "$_f" ] && cn_cache_sig="${cn_cache_sig}${_f}|"
done
if [ -z "${CN_NO_CACHE:-}" ] && [ -f "$cn_cache_file" ]; then
  cn_cache_stale=0
  _rest="$cn_cache_sig"
  while [ -n "$_rest" ]; do
    _f="${_rest%%|*}"
    _rest="${_rest#*|}"
    if [ "$_f" -nt "$cn_cache_file" ]; then cn_cache_stale=1; break; fi
  done
  if [ "$cn_cache_stale" = 0 ] && [ -z "${CN_FORCE_CHANNELS:-}" ]; then
    {
      IFS= read -r _line
      if [ "$_line" = "sig $cn_cache_sig" ]; then
        while IFS= read -r _line; do
          [ "$_line" = "$EVENT" ] && exit 0
        done
      else
        cn_cache_stale=1
      fi
    } < "$cn_cache_file"
  fi
fi

# SessionEnd: Claude Code gives all SessionEnd hooks a shared 1.5 s budget
# and cancels anything slower ("Hook cancelled" on /exit); a plugin hook's
# own timeout can't raise it. Hand the delivery to a detached copy of this
# script (it inherits the stdin pipe) and return straight away.
if [ "$EVENT" = "session-end" ] && [ -z "${CN_DETACHED:-}" ]; then
  if command -v nohup >/dev/null 2>&1; then
    CN_DETACHED=1 nohup bash "$0" "$EVENT" <&0 >/dev/null 2>&1 &
  else
    CN_DETACHED=1 bash "$0" "$EVENT" <&0 >/dev/null 2>&1 &
  fi
  disown 2>/dev/null || true
  exit 0
fi

# Exit fast if jq is missing � we depend on it everywhere.
if ! command -v jq >/dev/null 2>&1; then
  echo "claude-notifications: jq not found, skipping" >&2
  exit 0
fi

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

[ "$cn_cache_stale" = 1 ] && [ -z "${CN_NO_CACHE:-}" ] && cn_write_route_cache "$cn_cache_file" "$cn_cache_sig"

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

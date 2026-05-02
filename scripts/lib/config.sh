#!/usr/bin/env bash
# config.sh — Resolve config + per-event routing for claude-notifications.
#
# Resolution order (later wins):
#   1. ${CLAUDE_PLUGIN_ROOT}/config/default.json   (shipped defaults)
#   2. ~/.claude-notifications/config.json         (user global)
#   3. .claude-notifications.json                  (project-local)
#   4. CLAUDE_NOTIFICATIONS_CONFIG env var (path)
#   5. CN_* environment variables (override credentials)

set -uo pipefail

CN_DEFAULT_CONFIG="${CLAUDE_PLUGIN_ROOT:-}/config/default.json"
CN_USER_CONFIG="${HOME}/.claude-notifications/config.json"
CN_PROJECT_CONFIG="${CLAUDE_PROJECT_DIR:-$PWD}/.claude-notifications.json"
CN_ENV_CONFIG="${CLAUDE_NOTIFICATIONS_CONFIG:-}"

cn_log_dir="${HOME}/.claude-notifications/logs"
cn_log_file="${cn_log_dir}/notify.log"

cn_log() {
  mkdir -p "$cn_log_dir" 2>/dev/null || return 0
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$cn_log_file"
}

# Merge config files into a single JSON object (right-most wins).
cn_load_config() {
  local merged='{}'
  for f in "$CN_DEFAULT_CONFIG" "$CN_USER_CONFIG" "$CN_PROJECT_CONFIG" "$CN_ENV_CONFIG"; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    merged=$(jq -s '.[0] * .[1]' <(printf '%s' "$merged") "$f" 2>/dev/null || printf '%s' "$merged")
  done
  printf '%s' "$merged"
}

# Read a config field with env override support: cn_get .channels.slack.webhook_url CN_SLACK_WEBHOOK_URL
cn_get() {
  local jq_path="$1" env_var="${2:-}"
  if [ -n "$env_var" ] && [ -n "${!env_var:-}" ]; then
    printf '%s' "${!env_var}"
    return 0
  fi
  printf '%s' "$CN_CONFIG" | jq -r "${jq_path} // empty" 2>/dev/null
}

# Is a channel enabled? Default off if not declared.
cn_channel_enabled() {
  local channel="$1"
  local val
  val=$(printf '%s' "$CN_CONFIG" | jq -r ".channels.${channel}.enabled // false" 2>/dev/null)
  [ "$val" = "true" ]
}

# Channels enabled for a specific event. If event-specific list missing,
# fall back to channels.<name>.events array, else default to "all events".
cn_channels_for_event() {
  local event="$1"
  local list
  list=$(printf '%s' "$CN_CONFIG" | jq -r --arg ev "$event" '
    .events[$ev] // (
      [.channels // {} | to_entries[]
       | select(.value.enabled == true)
       | select((.value.events // ["*"]) | (index($ev) or index("*")))
       | .key]
    ) | .[]?
  ' 2>/dev/null)
  printf '%s\n' "$list"
}

CN_CONFIG=$(cn_load_config)
export CN_CONFIG

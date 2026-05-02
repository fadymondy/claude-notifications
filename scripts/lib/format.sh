#!/usr/bin/env bash
# format.sh — Convert a Claude Code hook event into a normalized notification.
#
# Inputs:
#   $1 = event name (notification, stop, subagent-stop, session-start, ...)
#   $CN_PAYLOAD = raw JSON read from stdin
#
# Outputs (env vars exported for channel handlers):
#   CN_EVENT       — event name
#   CN_TITLE       — short headline
#   CN_BODY        — long body
#   CN_LEVEL       — info|warn|error|success
#   CN_SESSION_ID  — Claude session id when present
#   CN_CWD         — working dir
#   CN_TOOL        — tool name when applicable
#   CN_PROJECT     — basename of cwd

set -uo pipefail

cn_jq() {
  printf '%s' "$CN_PAYLOAD" | jq -r "$1 // empty" 2>/dev/null
}

cn_format_event() {
  local event="$1"
  CN_EVENT="$event"
  CN_SESSION_ID=$(cn_jq '.session_id')
  CN_CWD=$(cn_jq '.cwd')
  [ -z "$CN_CWD" ] && CN_CWD="$PWD"
  CN_PROJECT=$(basename "$CN_CWD")
  CN_TOOL=$(cn_jq '.tool_name')
  CN_LEVEL="info"

  case "$event" in
    notification)
      local msg
      msg=$(cn_jq '.message')
      CN_TITLE="Claude needs you — ${CN_PROJECT}"
      CN_BODY="${msg:-Claude is waiting for input.}"
      CN_LEVEL="warn"
      ;;
    stop)
      CN_TITLE="Claude finished — ${CN_PROJECT}"
      CN_BODY="Claude completed the task and is waiting for your next prompt."
      CN_LEVEL="success"
      ;;
    subagent-stop)
      local agent
      agent=$(cn_jq '.subagent_type // .agent_name')
      CN_TITLE="Subagent finished — ${agent:-agent}"
      CN_BODY="Subagent ${agent:-} returned a result in ${CN_PROJECT}."
      CN_LEVEL="info"
      ;;
    session-start)
      local source
      source=$(cn_jq '.source')
      CN_TITLE="Claude session started — ${CN_PROJECT}"
      CN_BODY="Source: ${source:-startup}"
      CN_LEVEL="info"
      ;;
    session-end)
      local reason
      reason=$(cn_jq '.reason')
      CN_TITLE="Claude session ended — ${CN_PROJECT}"
      CN_BODY="Reason: ${reason:-exit}"
      CN_LEVEL="info"
      ;;
    user-prompt)
      local prompt
      prompt=$(cn_jq '.prompt' | head -c 200)
      CN_TITLE="Prompt submitted — ${CN_PROJECT}"
      CN_BODY="${prompt}"
      CN_LEVEL="info"
      ;;
    pre-tool)
      CN_TITLE="Tool starting — ${CN_TOOL:-tool}"
      CN_BODY="Claude is about to run ${CN_TOOL:-a tool} in ${CN_PROJECT}."
      CN_LEVEL="info"
      ;;
    post-tool)
      CN_TITLE="Tool finished — ${CN_TOOL:-tool}"
      CN_BODY="Claude finished running ${CN_TOOL:-a tool} in ${CN_PROJECT}."
      CN_LEVEL="info"
      ;;
    manual)
      CN_TITLE=$(cn_jq '.title')
      [ -z "$CN_TITLE" ] && CN_TITLE="Claude notification"
      CN_BODY=$(cn_jq '.body')
      local lvl
      lvl=$(cn_jq '.level')
      [ -n "$lvl" ] && CN_LEVEL="$lvl"
      ;;
    *)
      CN_TITLE="Claude event — ${event}"
      CN_BODY="Event ${event} fired in ${CN_PROJECT}."
      ;;
  esac

  export CN_EVENT CN_TITLE CN_BODY CN_LEVEL CN_SESSION_ID CN_CWD CN_TOOL CN_PROJECT
}

# Color emoji for the level — used by Slack/Discord/desktop banners.
cn_level_emoji() {
  case "${CN_LEVEL:-info}" in
    success) printf 'OK' ;;
    warn)    printf 'WARN' ;;
    error)   printf 'ERR' ;;
    *)       printf 'INFO' ;;
  esac
}

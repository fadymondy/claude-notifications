#!/usr/bin/env bash
# slack.sh — Send notification to Slack via incoming webhook.
#
# Config (~/.claude-notifications/config.json):
#   "slack": { "enabled": true, "webhook_url": "https://hooks.slack.com/...", "channel": "#claude" }
# Env override: CN_SLACK_WEBHOOK_URL

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

webhook=$(cn_get '.channels.slack.webhook_url' CN_SLACK_WEBHOOK_URL)
[ -z "$webhook" ] && { cn_log "slack: no webhook_url"; exit 0; }

channel=$(cn_get '.channels.slack.channel' CN_SLACK_CHANNEL)
username=$(cn_get '.channels.slack.username' CN_SLACK_USERNAME)
[ -z "$username" ] && username="Claude Code"

color="#36a64f"
case "${CN_LEVEL:-info}" in
  warn)    color="#f2c744" ;;
  error)   color="#e01e5a" ;;
  info)    color="#1d9bd1" ;;
  success) color="#36a64f" ;;
esac

payload=$(jq -n \
  --arg title "$CN_TITLE" \
  --arg body "$CN_BODY" \
  --arg color "$color" \
  --arg event "$CN_EVENT" \
  --arg project "$CN_PROJECT" \
  --arg cwd "$CN_CWD" \
  --arg username "$username" \
  --arg channel "$channel" \
  '{
    username: $username,
    icon_emoji: ":robot_face:",
    attachments: [{
      color: $color,
      title: $title,
      text: $body,
      footer: ($event + " — " + $project),
      mrkdwn_in: ["text"],
      fields: [
        {title: "Event", value: $event, short: true},
        {title: "Project", value: $project, short: true}
      ]
    }]
  } + (if $channel != "" then {channel: $channel} else {} end)')

curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
  -d "$payload" "$webhook" >/dev/null 2>&1 \
  || cn_log "slack: post failed"

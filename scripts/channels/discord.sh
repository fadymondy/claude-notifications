#!/usr/bin/env bash
# discord.sh — Send notification to Discord via webhook.
#
# Config: "discord": { "enabled": true, "webhook_url": "...", "username": "Claude" }
# Env override: CN_DISCORD_WEBHOOK_URL

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

webhook=$(cn_get '.channels.discord.webhook_url' CN_DISCORD_WEBHOOK_URL)
[ -z "$webhook" ] && { cn_log "discord: no webhook_url"; exit 0; }

username=$(cn_get '.channels.discord.username' CN_DISCORD_USERNAME)
[ -z "$username" ] && username="Claude Code"

# Discord color is decimal int.
color=3447003
case "${CN_LEVEL:-info}" in
  warn)    color=15844367 ;;
  error)   color=14693436 ;;
  success) color=3066993 ;;
  info)    color=3447003 ;;
esac

payload=$(jq -n \
  --arg username "$username" \
  --arg title "$CN_TITLE" \
  --arg body "$CN_BODY" \
  --arg event "$CN_EVENT" \
  --arg project "$CN_PROJECT" \
  --argjson color "$color" \
  '{
    username: $username,
    embeds: [{
      title: $title,
      description: $body,
      color: $color,
      footer: { text: ($event + " — " + $project) },
      timestamp: (now | todateiso8601)
    }]
  }')

curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
  -d "$payload" "$webhook" >/dev/null 2>&1 \
  || cn_log "discord: post failed"

#!/usr/bin/env bash
# webpush.sh — Browser web push.
# Two ways to deliver:
#   "ntfy"     — ntfy.sh-style topic; works with web, iOS, Android, desktop apps. (recommended, no setup)
#   "pushover" — Pushover.net REST (free for personal, supports iOS/Android/web)
#   "webhook"  — generic POST to your own VAPID-signing service
#
# Config:
#   "webpush": {
#     "enabled": true,
#     "provider": "ntfy",
#     "ntfy": { "server": "https://ntfy.sh", "topic": "claude-fady-XXXX", "priority": 4 }
#   }
#
#   "webpush": {
#     "enabled": true,
#     "provider": "pushover",
#     "pushover": { "user_key": "u...", "app_token": "a..." }
#   }

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

provider=$(cn_get '.channels.webpush.provider' CN_WEBPUSH_PROVIDER)
[ -z "$provider" ] && provider="ntfy"

case "$provider" in
  ntfy)
    server=$(cn_get '.channels.webpush.ntfy.server' CN_NTFY_SERVER)
    [ -z "$server" ] && server="https://ntfy.sh"
    topic=$(cn_get '.channels.webpush.ntfy.topic' CN_NTFY_TOPIC)
    [ -z "$topic" ] && { cn_log "webpush/ntfy: missing topic"; exit 0; }
    priority=$(cn_get '.channels.webpush.ntfy.priority' CN_NTFY_PRIORITY)
    [ -z "$priority" ] && priority="3"
    token=$(cn_get '.channels.webpush.ntfy.token' CN_NTFY_TOKEN)

    tags="robot"
    case "${CN_LEVEL:-info}" in
      success) tags="white_check_mark" ;;
      warn)    tags="warning" ;;
      error)   tags="rotating_light" ;;
      info)    tags="information_source" ;;
    esac

    headers=(
      -H "Title: ${CN_TITLE}"
      -H "Priority: ${priority}"
      -H "Tags: ${tags}"
    )
    [ -n "$token" ] && headers+=(-H "Authorization: Bearer ${token}")

    curl -sS -m 5 "${headers[@]}" \
      -d "$CN_BODY" \
      "${server%/}/${topic}" >/dev/null 2>&1 \
      || cn_log "webpush/ntfy: send failed"
    ;;

  pushover)
    user_key=$(cn_get '.channels.webpush.pushover.user_key' CN_PUSHOVER_USER_KEY)
    app_token=$(cn_get '.channels.webpush.pushover.app_token' CN_PUSHOVER_APP_TOKEN)
    [ -z "$user_key" ] || [ -z "$app_token" ] && { cn_log "webpush/pushover: missing keys"; exit 0; }
    priority=$(cn_get '.channels.webpush.pushover.priority' CN_PUSHOVER_PRIORITY)
    [ -z "$priority" ] && priority="0"

    curl -sS -m 5 -X POST "https://api.pushover.net/1/messages.json" \
      --data-urlencode "token=${app_token}" \
      --data-urlencode "user=${user_key}" \
      --data-urlencode "title=${CN_TITLE}" \
      --data-urlencode "message=${CN_BODY}" \
      --data-urlencode "priority=${priority}" >/dev/null 2>&1 \
      || cn_log "webpush/pushover: send failed"
    ;;

  webhook)
    url=$(cn_get '.channels.webpush.webhook.url' CN_WEBPUSH_WEBHOOK_URL)
    [ -z "$url" ] && { cn_log "webpush/webhook: missing url"; exit 0; }
    payload=$(jq -n \
      --arg title "$CN_TITLE" \
      --arg body "$CN_BODY" \
      --arg event "$CN_EVENT" \
      --arg project "$CN_PROJECT" \
      --arg level "$CN_LEVEL" \
      '{title:$title, body:$body, event:$event, project:$project, level:$level}')
    curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
      -d "$payload" "$url" >/dev/null 2>&1 \
      || cn_log "webpush/webhook: send failed"
    ;;

  *)
    cn_log "webpush: unknown provider '$provider'"
    ;;
esac

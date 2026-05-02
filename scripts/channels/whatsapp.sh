#!/usr/bin/env bash
# whatsapp.sh — Send WhatsApp notifications.
# Two providers supported:
#   "twilio"     — Twilio WhatsApp Business API (recommended for production)
#   "callmebot"  — CallMeBot personal API (free, simple, no business account)
#
# Config:
#   "whatsapp": {
#     "enabled": true,
#     "provider": "callmebot",
#     "callmebot": { "phone": "+201XXXXXXXXX", "apikey": "1234567" }
#   }
# Or:
#   "whatsapp": {
#     "enabled": true,
#     "provider": "twilio",
#     "twilio": {
#       "account_sid": "ACxxxx",
#       "auth_token": "xxxx",
#       "from": "whatsapp:+14155238886",
#       "to": ["whatsapp:+201XXXXXXXXX"]
#     }
#   }

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

provider=$(cn_get '.channels.whatsapp.provider' CN_WHATSAPP_PROVIDER)
[ -z "$provider" ] && provider="callmebot"

message="*${CN_TITLE}*
${CN_BODY}

_Event: ${CN_EVENT} • Project: ${CN_PROJECT}_"

case "$provider" in
  callmebot)
    phone=$(cn_get '.channels.whatsapp.callmebot.phone' CN_CALLMEBOT_PHONE)
    apikey=$(cn_get '.channels.whatsapp.callmebot.apikey' CN_CALLMEBOT_APIKEY)
    [ -z "$phone" ] || [ -z "$apikey" ] && { cn_log "whatsapp/callmebot: missing phone or apikey"; exit 0; }
    curl -sS -m 8 -G "https://api.callmebot.com/whatsapp.php" \
      --data-urlencode "phone=$phone" \
      --data-urlencode "text=$message" \
      --data-urlencode "apikey=$apikey" >/dev/null 2>&1 \
      || cn_log "whatsapp/callmebot: send failed"
    ;;

  twilio)
    sid=$(cn_get '.channels.whatsapp.twilio.account_sid' CN_TWILIO_ACCOUNT_SID)
    token=$(cn_get '.channels.whatsapp.twilio.auth_token' CN_TWILIO_AUTH_TOKEN)
    from=$(cn_get '.channels.whatsapp.twilio.from' CN_TWILIO_FROM)
    [ -z "$sid" ] || [ -z "$token" ] || [ -z "$from" ] && { cn_log "whatsapp/twilio: missing creds"; exit 0; }

    to_list=()
    while IFS= read -r _addr; do
      [ -n "$_addr" ] && to_list+=("$_addr")
    done < <(printf '%s' "$CN_CONFIG" | jq -r '.channels.whatsapp.twilio.to[]? // empty' 2>/dev/null)
    if [ "${#to_list[@]}" -eq 0 ] && [ -n "${CN_TWILIO_TO:-}" ]; then
      IFS=',' read -ra to_list <<< "$CN_TWILIO_TO"
    fi
    [ "${#to_list[@]}" -eq 0 ] && { cn_log "whatsapp/twilio: no recipients"; exit 0; }

    for recip in "${to_list[@]}"; do
      curl -sS -m 8 -X POST \
        "https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json" \
        -u "${sid}:${token}" \
        --data-urlencode "From=${from}" \
        --data-urlencode "To=${recip}" \
        --data-urlencode "Body=${message}" >/dev/null 2>&1 \
        || cn_log "whatsapp/twilio: send failed for $recip"
    done
    ;;

  *)
    cn_log "whatsapp: unknown provider '$provider'"
    ;;
esac

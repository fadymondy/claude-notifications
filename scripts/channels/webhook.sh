#!/usr/bin/env bash
# webhook.sh — Generic outgoing webhook.
# Sends a normalized JSON payload to one or more URLs, with optional auth header
# and HMAC-SHA256 signing for receiver verification.
#
# Config:
#   "webhook": {
#     "enabled": true,
#     "urls": ["https://api.example.com/claude/notify"],
#     "method": "POST",
#     "headers": { "X-Source": "claude-code" },
#     "auth_header": "Bearer xxxxx",
#     "secret": "shared-hmac-secret"
#   }

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

urls=()
while IFS= read -r _u; do
  [ -n "$_u" ] && urls+=("$_u")
done < <(printf '%s' "$CN_CONFIG" | jq -r '.channels.webhook.urls[]? // empty' 2>/dev/null)
if [ "${#urls[@]}" -eq 0 ]; then
  single=$(cn_get '.channels.webhook.url' CN_WEBHOOK_URL)
  [ -n "$single" ] && urls=("$single")
fi
[ "${#urls[@]}" -eq 0 ] && { cn_log "webhook: no urls"; exit 0; }

method=$(cn_get '.channels.webhook.method' CN_WEBHOOK_METHOD)
[ -z "$method" ] && method="POST"
auth=$(cn_get '.channels.webhook.auth_header' CN_WEBHOOK_AUTH)
secret=$(cn_get '.channels.webhook.secret' CN_WEBHOOK_SECRET)

payload=$(jq -n \
  --arg event "$CN_EVENT" \
  --arg title "$CN_TITLE" \
  --arg body "$CN_BODY" \
  --arg level "$CN_LEVEL" \
  --arg project "$CN_PROJECT" \
  --arg cwd "$CN_CWD" \
  --arg session "$CN_SESSION_ID" \
  --arg tool "$CN_TOOL" \
  --argjson ts "$(date +%s)" \
  '{event:$event, title:$title, body:$body, level:$level, project:$project, cwd:$cwd, session_id:$session, tool:$tool, timestamp:$ts}')

signature=""
if [ -n "$secret" ]; then
  if command -v openssl >/dev/null 2>&1; then
    signature=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | xxd -p -c 256)
  fi
fi

# Custom headers from config object, expanded as -H flags.
header_flags=()
while IFS= read -r _h; do
  [ -n "$_h" ] && header_flags+=("$_h")
done < <(printf '%s' "$CN_CONFIG" | jq -r '
  .channels.webhook.headers // {} | to_entries[] | "\(.key): \(.value)"
' 2>/dev/null)

for url in "${urls[@]}"; do
  curl_args=(-sS -m 5 -X "$method" -H 'Content-Type: application/json')
  [ -n "$auth" ] && curl_args+=(-H "Authorization: $auth")
  [ -n "$signature" ] && curl_args+=(-H "X-Claude-Signature: sha256=${signature}")
  for h in "${header_flags[@]}"; do
    [ -n "$h" ] && curl_args+=(-H "$h")
  done
  curl_args+=(-d "$payload" "$url")
  curl "${curl_args[@]}" >/dev/null 2>&1 \
    || cn_log "webhook: post to $url failed"
done

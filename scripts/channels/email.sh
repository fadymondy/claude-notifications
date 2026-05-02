#!/usr/bin/env bash
# email.sh — Send email notifications.
# Supports two transports:
#   "smtp"  — uses curl with SMTP/SMTPS (RFC 5321). Tested with Gmail, Mailgun, SendGrid SMTP.
#   "sendmail" — pipes to /usr/sbin/sendmail when transport unset and binary exists.
#
# Config:
#   "email": {
#     "enabled": true,
#     "transport": "smtp",
#     "smtp_url": "smtps://smtp.gmail.com:465",
#     "smtp_user": "you@gmail.com",
#     "smtp_password": "app-password",
#     "from": "Claude Code <you@gmail.com>",
#     "to": ["you@gmail.com"]
#   }

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

transport=$(cn_get '.channels.email.transport' CN_EMAIL_TRANSPORT)
[ -z "$transport" ] && transport="smtp"

from=$(cn_get '.channels.email.from' CN_EMAIL_FROM)
[ -z "$from" ] && { cn_log "email: missing 'from'"; exit 0; }

to_list=()
while IFS= read -r _addr; do
  [ -n "$_addr" ] && to_list+=("$_addr")
done < <(printf '%s' "$CN_CONFIG" | jq -r '.channels.email.to[]? // empty' 2>/dev/null)
if [ "${#to_list[@]}" -eq 0 ] && [ -n "${CN_EMAIL_TO:-}" ]; then
  IFS=',' read -ra to_list <<< "$CN_EMAIL_TO"
fi
[ "${#to_list[@]}" -eq 0 ] && { cn_log "email: no recipients"; exit 0; }

subject="[Claude] ${CN_TITLE}"
date_hdr=$(date -u +"%a, %d %b %Y %H:%M:%S +0000")

build_message() {
  local recip="$1"
  cat <<EOF
From: ${from}
To: ${recip}
Subject: ${subject}
Date: ${date_hdr}
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

${CN_BODY}

—
Event: ${CN_EVENT}
Project: ${CN_PROJECT}
CWD: ${CN_CWD}
Session: ${CN_SESSION_ID:-n/a}
EOF
}

if [ "$transport" = "sendmail" ] || { [ "$transport" = "auto" ] && command -v sendmail >/dev/null 2>&1; }; then
  for recip in "${to_list[@]}"; do
    build_message "$recip" | /usr/sbin/sendmail -t 2>/dev/null \
      || cn_log "email: sendmail failed"
  done
  exit 0
fi

# SMTP via curl
smtp_url=$(cn_get '.channels.email.smtp_url' CN_SMTP_URL)
smtp_user=$(cn_get '.channels.email.smtp_user' CN_SMTP_USER)
smtp_pass=$(cn_get '.channels.email.smtp_password' CN_SMTP_PASSWORD)
[ -z "$smtp_url" ] && { cn_log "email: missing smtp_url"; exit 0; }

# Extract bare envelope-from address.
env_from=$(printf '%s' "$from" | sed -E 's/.*<([^>]+)>.*/\1/' | head -n1)
[ -z "$env_from" ] && env_from="$from"

tmp=$(mktemp -t claude-notif.XXXXXX)
trap 'rm -f "$tmp"' EXIT

for recip in "${to_list[@]}"; do
  build_message "$recip" > "$tmp"
  curl_args=(--silent --max-time 10 --url "$smtp_url" \
    --mail-from "$env_from" --mail-rcpt "$recip" \
    --upload-file "$tmp")
  [ -n "$smtp_user" ] && curl_args+=(--user "$smtp_user:$smtp_pass")
  curl "${curl_args[@]}" >/dev/null 2>&1 \
    || cn_log "email: smtp send failed for $recip"
done

---
name: notify-channel
description: Build a custom notification channel handler — Telegram, Microsoft Teams, Pushbullet, SMS via a non-Twilio provider, internal company chat, anything. Use when the user wants notifications somewhere the built-in channels don't support, or wants to fork an existing channel for a different API shape.
---

# /notify-channel — build a custom channel

The dispatcher (`scripts/notify.sh`) auto-discovers channels in two locations:

1. `${CLAUDE_PLUGIN_ROOT}/scripts/channels/<name>.sh` — shipped with the plugin
2. `~/.claude-notifications/channels/<name>.sh` — user-installed custom channels

Drop a script in #2 and it works. No registration step.

## Template

```bash
#!/usr/bin/env bash
# ~/.claude-notifications/channels/<name>.sh
set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

# 1. Read credentials. cn_get takes a jq path and an optional env-var override.
token=$(cn_get '.channels.<name>.token' CN_<NAME>_TOKEN)
[ -z "$token" ] && { cn_log "<name>: missing token"; exit 0; }

# 2. Build the payload. CN_TITLE / CN_BODY / CN_LEVEL / CN_EVENT / CN_PROJECT
#    are exported by the dispatcher.
payload=$(jq -n \
  --arg title "$CN_TITLE" \
  --arg body "$CN_BODY" \
  '{title: $title, message: $body}')

# 3. Send. ALWAYS time-bound (≤5s) and ALWAYS swallow errors via cn_log.
curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "$payload" "https://api.example.com/notify" >/dev/null 2>&1 \
  || cn_log "<name>: send failed"
```

## Rules to follow

1. **Never block Claude Code.** Time-bound every network call; non-zero exits are swallowed by the dispatcher but slow handlers will block until the 5s timeout.
2. **Log instead of printing.** `cn_log "..."` writes to `~/.claude-notifications/logs/notify.log`. Stdout/stderr go to the same log file via the dispatcher.
3. **Default-off behavior on missing config.** If credentials are absent, log and exit 0 — don't error.
4. **Respect `level`.** `CN_LEVEL` is `info|warn|error|success`. Map it to whatever color/severity the target API uses.
5. **Make `enabled: false` an automatic skip.** The dispatcher already does this — the channel won't be invoked unless `channels.<name>.enabled` is `true`.

## Common targets — where to point curl

| Service        | Endpoint                                                              | Auth                |
|----------------|-----------------------------------------------------------------------|---------------------|
| Telegram       | `https://api.telegram.org/bot<TOKEN>/sendMessage`                     | bot token in URL    |
| MS Teams       | Incoming Webhook URL from connector                                   | none (URL is secret)|
| Pushbullet     | `https://api.pushbullet.com/v2/pushes`                                | `Access-Token` header |
| Mattermost     | Incoming Webhook URL                                                  | none                |
| ntfy.sh (self) | `https://your-ntfy/<topic>`                                           | optional bearer     |
| Twitter/X DM   | OAuth 1.0a — use a small Python helper, not bash                      | OAuth tokens        |

## After writing

1. `chmod +x ~/.claude-notifications/channels/<name>.sh`
2. Add the channel block to user config:
   ```bash
   jq '.channels.<name> = {enabled:true, token:"...", events:["notification","stop"]}' \
     ~/.claude-notifications/config.json
   ```
3. Test with the dispatcher:
   ```bash
   bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<< '{"title":"custom","body":"hi"}'
   ```
4. Confirm with one line. Don't paste the script back at the user — they wrote it (or you wrote it for them and they can read it).

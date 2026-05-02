---
name: notify-config
description: Configure Claude Code notification channels — enable Slack/Discord/email/WhatsApp/desktop voice/web push, set credentials, route specific events to specific channels. Use when the user wants to "set up notifications", "add a Slack webhook", "turn on voice", "stop notifications for X event", or otherwise manage `~/.claude-notifications/config.json`.
---

# /notify-config — manage notification channels

This skill edits the user's notification config at `~/.claude-notifications/config.json` (or the project-local override at `<project>/.claude-notifications.json`).

## Steps

1. **Read current config first.** Always:
   ```bash
   cat ~/.claude-notifications/config.json 2>/dev/null || echo '{}'
   ```
   Never overwrite without seeing what's there.

2. **Merge new channel block into existing JSON.** Use `jq` so you don't lose other channels:
   ```bash
   mkdir -p ~/.claude-notifications
   tmp=$(mktemp)
   jq '.channels.slack = {
     enabled: true,
     webhook_url: "https://hooks.slack.com/services/...",
     channel: "#claude",
     events: ["notification","stop"]
   }' ~/.claude-notifications/config.json > "$tmp" \
     && mv "$tmp" ~/.claude-notifications/config.json
   ```

3. **Set `enabled: false` to disable** instead of removing the block — preserves credentials for re-enabling.

4. **Test immediately** after a change:
   ```bash
   bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<< '{"title":"config test","body":"new channel works"}'
   tail -3 ~/.claude-notifications/logs/notify.log
   ```

## Channel cheat sheet

| Channel    | Required fields                                                                |
|------------|---------------------------------------------------------------------------------|
| `slack`    | `webhook_url` (Incoming Webhook from api.slack.com)                            |
| `discord`  | `webhook_url` (Server Settings → Integrations → Webhooks)                       |
| `email`    | `smtp_url`, `smtp_user`, `smtp_password`, `from`, `to[]` — Gmail needs an app password |
| `whatsapp` | `provider: callmebot` → `phone` + `apikey` (text "I allow callmebot" to +34 644 51 95 23 to get one) |
|            | `provider: twilio` → `account_sid`, `auth_token`, `from`, `to[]`                |
| `desktop`  | nothing required — works out of the box. `voice.enabled` for spoken alerts.    |
| `webpush`  | `provider: ntfy` → just a unique `topic`. Install ntfy app on phone, subscribe to topic. |
|            | `provider: pushover` → `user_key` + `app_token`                                 |
| `webhook`  | `urls[]` — your own endpoint                                                    |

## Event routing

A channel sees an event when **either**:
- the channel's `events` array contains that event name (or `"*"`), or
- the top-level `events.<name>` array names the channel.

Default to `["notification", "stop"]` — never `["*"]` unless the user explicitly asks. `pre-tool` and `post-tool` fire many times per turn.

Events: `notification`, `stop`, `subagent-stop`, `session-start`, `session-end`, `user-prompt`, `pre-tool`, `post-tool`, `manual`.

## Credentials hygiene

- Project config (`<project>/.claude-notifications.json`) is fine for routing rules but **never put secrets there** — it can be committed.
- Put creds in `~/.claude-notifications/config.json` (chmod 600) or `CN_*` env vars.
- If the user pastes a webhook URL or token in chat, write it to user config and tell them where it landed so they can rotate later.

## When done

Confirm with one line: which channels are now enabled and which events fire them. No long recap.

---
description: Interactive setup — walks through enabling notification channels and writes ~/.claude-notifications/config.json
argument-hint: [channel-name]
allowed-tools: Bash, Read, Write, Edit
---

Set up notification channels for the first time, or add a new one.

Argument: `$ARGUMENTS` — optional channel to focus on (`slack`, `discord`, `email`, `whatsapp`, `desktop`, `webpush`, `webhook`). If omitted, ask which the user wants to enable.

## Steps

1. **Ensure config exists** with sensible defaults if missing:
   ```bash
   mkdir -p ~/.claude-notifications
   [ ! -f ~/.claude-notifications/config.json ] && \
     cp "$CLAUDE_PLUGIN_ROOT/config/default.json" ~/.claude-notifications/config.json
   chmod 600 ~/.claude-notifications/config.json
   ```

2. **For the requested channel, ask the user only the questions you can't answer yourself.** Don't ask for things you already know:
   - `slack` → just the webhook URL (channel & username have sensible defaults)
   - `discord` → just the webhook URL
   - `email` (Gmail) → email address + app password (link them to https://myaccount.google.com/apppasswords)
   - `whatsapp` (CallMeBot) → phone number + apikey (tell them how to get one: text "I allow callmebot to send me messages" to +34 644 51 95 23)
   - `whatsapp` (Twilio) → SID, token, from-number, to-number(s)
   - `desktop` → enable, ask whether they want voice (default no), and if yes which voice
   - `webpush` (ntfy) → suggest a unique topic name like `claude-<user>-<random>` and tell them to install ntfy on their phone and subscribe to the topic
   - `webpush` (pushover) → user_key + app_token
   - `webhook` → URL + optional secret

3. **Merge into config** with `jq`, never overwrite the whole file. Example for slack:
   ```bash
   tmp=$(mktemp)
   jq --arg url "$WEBHOOK_URL" '.channels.slack = {
     enabled: true,
     webhook_url: $url,
     username: "Claude Code",
     events: ["notification","stop"]
   }' ~/.claude-notifications/config.json > "$tmp" && mv "$tmp" ~/.claude-notifications/config.json
   ```

4. **Test immediately** by firing through that channel only:
   ```bash
   CN_FORCE_CHANNELS=<channel> bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<< \
     '{"title":"Setup successful","body":"<channel> is now wired to Claude Code.","level":"success"}'
   ```

5. **Verify** by checking the log for failures and asking the user "did you receive it?"

## Defaults to use

- New channels start with `events: ["notification","stop"]`. **Never default to `["*"]`** — `pre-tool` and `post-tool` fire dozens of times per turn.
- Always keep `enabled: false` channels intact rather than deleting them.

## When done

Confirm with one line: which channel was wired, where the config lives, and how to add more (`/notify-setup <other-channel>`).

# claude-notifications

A Claude Code plugin that sends notifications anywhere — Slack, Discord, email, WhatsApp, desktop (with voice via `say`), web push, and generic webhooks — driven by Claude Code's hook events. Ships with an optional Electron **tray app** for one-click channel toggling and visual configuration.

[![test](https://github.com/fadymondy/claude-notifications/actions/workflows/test.yml/badge.svg)](https://github.com/fadymondy/claude-notifications/actions/workflows/test.yml)
[![release](https://github.com/fadymondy/claude-notifications/actions/workflows/release.yml/badge.svg)](https://github.com/fadymondy/claude-notifications/actions/workflows/release.yml)

When Claude finishes a task, gets stuck waiting for input, or runs a tool you care about, this plugin fans the event out to whichever channels you've enabled. You walk away from the terminal and still get pinged.

## What you get

| Channel    | Purpose                                                              | Required setup                          |
|------------|----------------------------------------------------------------------|------------------------------------------|
| `desktop`  | Native banners (macOS / Linux / Windows). Optional spoken alerts via `say`. | None — works out of the box |
| `slack`    | Posts to a Slack channel via Incoming Webhook                        | Webhook URL                              |
| `discord`  | Posts to a Discord channel via webhook                               | Webhook URL                              |
| `email`    | Sends email via SMTP or `sendmail`                                   | SMTP creds                               |
| `whatsapp` | WhatsApp via Twilio or CallMeBot                                     | Twilio account or CallMeBot apikey       |
| `webpush`  | Phone/web push via ntfy.sh, Pushover, or your own VAPID server       | ntfy topic, Pushover keys, or webhook    |
| `webhook`  | Generic JSON POST to your own endpoint with HMAC signing             | Your URL                                 |
| _custom_   | Drop a `.sh` in `~/.claude-notifications/channels/` and it works     | One bash file                            |

Voice notifications use `say` on macOS, `spd-say`/`espeak` on Linux. Pick a voice, rate, and template.

## Install

```bash
# Clone or install via Claude Code's plugin system once published
git clone https://github.com/fadymondy/claude-notifications ~/.claude/plugins/claude-notifications
```

Then enable it in your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "plugins": ["claude-notifications"]
}
```

Restart Claude Code. The hooks register automatically from `hooks/hooks.json`.

## Configure

Three layers, last wins:

1. Plugin defaults — `${CLAUDE_PLUGIN_ROOT}/config/default.json` (don't edit)
2. **Your global config — `~/.claude-notifications/config.json`** (edit this)
3. Project-local — `<project>/.claude-notifications.json` (routing rules only — never put secrets here)

Easiest path: run `/notify-setup <channel>` from inside Claude Code. It walks you through one channel at a time.

Or copy the example and edit:

```bash
mkdir -p ~/.claude-notifications
cp examples/config.example.json ~/.claude-notifications/config.json
chmod 600 ~/.claude-notifications/config.json
$EDITOR ~/.claude-notifications/config.json
```

### Minimal example — Slack only

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "webhook_url": "https://hooks.slack.com/services/T000/B000/XXXXXXXX",
      "channel": "#claude",
      "events": ["notification", "stop"]
    }
  }
}
```

That's it. When Claude finishes (`stop`) or asks for input (`notification`), Slack pings.

### Adding voice alerts

```json
{
  "channels": {
    "desktop": {
      "enabled": true,
      "voice": {
        "enabled": true,
        "name": "",
        "rate": 180,
        "style": "title"
      },
      "sound": "Funk",
      "events": ["notification", "stop"]
    }
  }
}
```

`style` picks what gets spoken: `title`, `body`, or `both`. Or set `text` to a custom template — `{title}`, `{body}`, `{project}`, `{event}` are substituted.

**Natural human voices on macOS.** Leave `voice.name` blank and the plugin auto-picks the most natural-sounding voice available, in this order:

1. Siri-quality voice matching your system locale (best — sounds like Siri)
2. Premium / Enhanced voice in your locale
3. Any Siri voice in the same language family
4. Any Premium / Enhanced voice in the same language family
5. Pre-installed defaults: `Daniel` (en_GB), `Samantha` (en_US), `Karen` (en_AU), `Moira` (en_IE)

For Siri-quality output, download a Premium voice via **System Settings → Accessibility → Spoken Content → System Voice → Manage Voices** (look for "Ava (Premium)", "Zoe (Premium)", "Tom (Premium)", etc.). Once installed it's auto-detected — no config change needed.

List available voices: `say -v '?'`

## Tray app (optional, recommended)

A tiny cross-platform Electron app that lives in your menubar / system tray. Toggle channels on/off without touching JSON, edit credentials in a real form, and fire test notifications per channel — all in one place. Reads and writes the same `~/.claude-notifications/config.json` the bash dispatcher uses, so the tray app and Claude Code stay in sync.

**Features:**

- Quick-toggle each channel from the tray menu
- Per-channel settings UI with all fields, helper text, and conditional fields (e.g. Twilio vs CallMeBot)
- "Send test" button per channel that hits the real dispatcher
- Per-event routing matrix (which events fire which channels)
- Tail the live notification log in-app
- macOS: hidden dock icon (true menubar app), template tray icon that adapts to light/dark mode
- Single-instance lock: launching it again just opens the settings window
- Watches the config file — edits via `/notify-config` or text editor refresh the menu instantly

**Install (download a prebuilt release):**

| OS      | Download from [Releases](https://github.com/fadymondy/claude-notifications/releases) |
|---------|--------------------------------------------------------------------------------------|
| macOS   | `Claude-Notifications-<version>-mac.dmg` (universal: x64 + arm64)                    |
| Windows | `Claude-Notifications-Setup-<version>.exe` (NSIS installer)                          |
| Linux   | `Claude-Notifications-<version>.AppImage` or `.deb`                                  |

**Build from source:**

```bash
cd app
npm install
npm start          # run in dev mode
npm run dist:mac   # build .dmg + .zip
npm run dist:win   # build .exe (run on Windows)
npm run dist:linux # build .AppImage + .deb (run on Linux)
```

The tray app uses Electron's built-in cross-platform notification + system tray APIs, so the same UI works identically on macOS, Windows, and Linux. On macOS, voice still goes through `say`; on Windows it uses native toast; on Linux it uses `notify-send`.

## Slash commands

- `/notify <title> | <body>` — fire a notification through configured channels right now
- `/notify-test [channel]` — send a test ping through every enabled channel (or one)
- `/notify-setup [channel]` — interactive setup that writes config for you

## The notification agent

Need help wiring something custom? Spawn the `notification-manager` agent — it knows the plugin internals, can edit your config, build new channel handlers, and debug "why didn't it fire?" silence.

## Skills

- **notify** — send arbitrary notifications during a task
- **notify-config** — manage `~/.claude-notifications/config.json`
- **notify-channel** — author new channel handlers (Telegram, Teams, Pushbullet, etc.)

## How event routing works

Two ways to route an event to channels:

1. **Per-channel `events` array** — list events the channel cares about:
   ```json
   { "slack": { "events": ["notification", "stop"] } }
   ```
2. **Top-level `events` map** — list channels per event (overrides per-channel routing):
   ```json
   { "events": { "stop": ["slack", "desktop"], "notification": ["desktop"] } }
   ```

Available events: `notification`, `stop`, `subagent-stop`, `session-start`, `session-end`, `user-prompt`, `pre-tool`, `post-tool`, `manual`.

> Don't enable `pre-tool` / `post-tool` / `user-prompt` unless you really want noise — they fire many times per turn.

## Build a custom channel

Drop a script at `~/.claude-notifications/channels/<name>.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

token=$(cn_get '.channels.<name>.token' CN_<NAME>_TOKEN)
[ -z "$token" ] && exit 0

curl -sS -m 5 -X POST "https://api.example.com/notify" \
  -H "Authorization: Bearer $token" \
  --data-urlencode "title=$CN_TITLE" \
  --data-urlencode "body=$CN_BODY" >/dev/null 2>&1 \
  || cn_log "<name>: send failed"
```

The dispatcher will pick it up. Spec: read from env (`CN_TITLE`, `CN_BODY`, `CN_LEVEL`, `CN_EVENT`, `CN_PROJECT`, `CN_CWD`, `CN_TOOL`, `CN_SESSION_ID`), time-bound to ≤5s, log via `cn_log`, exit 0 on missing config. See `scripts/channels/slack.sh` for the simplest reference.

Or just ask: `/notify-channel build me a Telegram channel` and the agent will scaffold it.

## Webhook signing

For generic webhooks with an HMAC `secret`, the plugin sends `X-Claude-Signature: sha256=<hex>` computed over the JSON body. Verify on your end with the same shared secret.

## Environment variable overrides

Every credential field also accepts an env var override, useful for CI or shared configs:

| Field                                | Env var                       |
|--------------------------------------|-------------------------------|
| `channels.slack.webhook_url`         | `CN_SLACK_WEBHOOK_URL`        |
| `channels.discord.webhook_url`       | `CN_DISCORD_WEBHOOK_URL`      |
| `channels.email.smtp_password`       | `CN_SMTP_PASSWORD`            |
| `channels.whatsapp.callmebot.apikey` | `CN_CALLMEBOT_APIKEY`         |
| `channels.whatsapp.twilio.auth_token`| `CN_TWILIO_AUTH_TOKEN`        |
| `channels.webpush.ntfy.topic`        | `CN_NTFY_TOPIC`               |
| `channels.webhook.urls[0]`           | `CN_WEBHOOK_URL`              |

Full list in each handler under `scripts/channels/`.

## Debugging silence

```bash
tail -f ~/.claude-notifications/logs/notify.log
```

The log shows which event fired, which channels matched, and which failed. Most "why isn't it working?" answers are one tail away.

Common causes:

- Channel enabled but `events` array doesn't include the event you expected → fix the array.
- Slack/Discord webhook returns 404 → revoked or scoped to a different channel.
- macOS silent notifications → System Settings → Notifications → make sure Script Editor / Terminal can show banners.
- `say` not speaking → `voice.enabled: true` missing from config.
- Hook didn't fire → `claude --debug hooks` to confirm Claude Code sees the hook bindings.

## Requirements

**Plugin (bash dispatcher):**
- `bash` (3.2+ — works with macOS default)
- `jq` (`brew install jq` / `apt install jq`)
- `curl` (everywhere)
- `osascript` + `say` for macOS desktop/voice
- `notify-send` + `spd-say` or `espeak` for Linux desktop/voice
- PowerShell for Windows desktop notifications

**Tray app (optional):**
- macOS 10.13+, Windows 10+, or Linux with X11/Wayland
- Node 20 or 22 (only required to build from source — prebuilt releases need nothing)

## Development

```bash
git clone https://github.com/fadymondy/claude-notifications
cd claude-notifications

# Bash dispatcher — test directly:
CLAUDE_PLUGIN_ROOT="$PWD" CN_FORCE_CHANNELS=desktop \
  bash scripts/notify.sh manual <<< '{"title":"hi","body":"test","level":"info"}'

# Tray app — run in dev:
cd app
npm install
npm start
```

CI runs on every push: shellcheck on every channel handler, JSON validation, plugin manifest validation, and the Electron app's smoke tests on Linux/macOS/Windows × Node 20/22. Tagged commits (`vX.Y.Z`) trigger a release build that produces installers for all three OSes and uploads them to GitHub Releases.

## License

MIT — see [LICENSE](LICENSE).

## Author

Built by [Fady Mondy](https://github.com/fadymondy) for Claude Code.

---
name: notify
description: Send a one-shot notification through the configured Claude Code notification channels. Use when the user asks to "notify me when X", "send a message", "ping Slack/Discord/me", or wants Claude to push an arbitrary status update through whichever channels they've enabled. Routes through the same dispatcher Claude Code hooks use, so it respects per-channel and per-event config.
---

# /notify — send a notification on demand

Run the plugin's dispatcher in `manual` mode to fire a notification through every channel enabled for the `manual` event (or every enabled channel if `manual` is unrouted).

## Usage

```
/notify <title> | <body>
/notify --title "Build done" --body "All 47 tests pass" --level success
/notify --level warn "Disk almost full"
```

Pipe-separated form: everything before the first `|` is the title, everything after is the body.

## How to invoke

Build a JSON payload and pipe it to the dispatcher. Always run from the plugin root or pass `CLAUDE_PLUGIN_ROOT`.

```bash
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:?run from inside Claude Code}" \
  bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<EOF
{"title":"$TITLE","body":"$BODY","level":"$LEVEL"}
EOF
```

`level` is one of `info | warn | error | success` and changes the color/emoji on Slack/Discord/web push. Default is `info`.

## Targeted send

To send to a single channel only (bypassing routing), set `CN_FORCE_CHANNELS`:

```bash
CN_FORCE_CHANNELS=slack,desktop bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<< '{"title":"...","body":"..."}'
```

(If the user asks for a "channel-only" send and `CN_FORCE_CHANNELS` isn't honored yet, edit `scripts/notify.sh` to support it — it's a 4-line change reading the env var into `channels`.)

## After sending

Tail the log and confirm dispatch:

```bash
tail -5 ~/.claude-notifications/logs/notify.log
```

Don't lecture the user about which channels fired — they configured them. Just confirm "sent" and stop.

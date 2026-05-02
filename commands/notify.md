---
description: Send a notification through configured Claude Code notification channels
argument-hint: "[--level info|warn|error|success] <title> | <body>"
allowed-tools: Bash
---

Send a manual notification right now using the user's configured Claude Code notification channels.

Arguments: `$ARGUMENTS`

Parse the arguments:
- If `--level <lvl>` appears, use it; otherwise default to `info`.
- Everything before the first `|` is the title; everything after is the body. If no `|`, the whole text is both title and body.
- If `$ARGUMENTS` is empty, use title `"Claude notification"` and body `"(no message)"`.

Then run:

```bash
CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:?run this from inside Claude Code}" \
  bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<EOF
{"title":"<TITLE>","body":"<BODY>","level":"<LEVEL>"}
EOF
```

After sending, run `tail -3 ~/.claude-notifications/logs/notify.log` and report **only**:
- "Sent to: <channel list>" (parsed from the log lines), or
- "No channels enabled — run /notify-config first" if the log shows `no channels enabled for manual`.

One line. No recap of the channels' details.

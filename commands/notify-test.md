---
description: Test all enabled notification channels by firing a manual event through each
argument-hint: [channel-name]
allowed-tools: Bash
---

Test the notification system end-to-end.

Argument: `$ARGUMENTS` — optional channel name (e.g. `slack`). If omitted, tests every enabled channel.

Steps:

1. **Read config and list enabled channels.**
   ```bash
   jq -r '.channels | to_entries[] | select(.value.enabled == true) | .key' \
     ~/.claude-notifications/config.json 2>/dev/null
   ```

2. **If `$ARGUMENTS` is set:** restrict to that one channel.

3. **Fire a test through each channel** using `CN_FORCE_CHANNELS`:
   ```bash
   for ch in $CHANNELS; do
     CLAUDE_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}" \
     CN_FORCE_CHANNELS="$ch" \
       bash "$CLAUDE_PLUGIN_ROOT/scripts/notify.sh" manual <<EOF
   {"title":"Channel test: $ch","body":"If you see this, $ch is working.","level":"info"}
   EOF
   done
   ```

4. **Tail the log** and surface any `failed` lines so the user knows which channels broke:
   ```bash
   tail -20 ~/.claude-notifications/logs/notify.log | grep -E 'failed|error' || echo "All channels: no errors logged."
   ```

Report a tight summary: which channels were tested, which logged a failure, and where to look next (`~/.claude-notifications/logs/notify.log`). Do not list the channels' full config back at the user.

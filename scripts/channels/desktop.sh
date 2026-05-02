#!/usr/bin/env bash
# desktop.sh — Native desktop notifications.
# macOS:  osascript display notification + optional `say` voice.
# Linux:  notify-send (libnotify) + optional `spd-say` / `espeak`.
# Windows: PowerShell BurntToast fallback when invoked from WSL/Git Bash.
#
# Config:
#   "desktop": {
#     "enabled": true,
#     "voice": { "enabled": true, "name": "Samantha", "rate": 180 },
#     "sound": "Funk"
#   }

set -uo pipefail
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.sh"

title="${CN_TITLE:-Claude}"
body="${CN_BODY:-}"

voice_enabled=$(cn_get '.channels.desktop.voice.enabled')
voice_name=$(cn_get '.channels.desktop.voice.name' CN_VOICE_NAME)
voice_rate=$(cn_get '.channels.desktop.voice.rate' CN_VOICE_RATE)
voice_text=$(cn_get '.channels.desktop.voice.text')
sound=$(cn_get '.channels.desktop.sound')

# Per-event audio file. The tray app stores user uploads as
# ~/.claude-notifications/audio/desktop/<event>.<ext>. When a file exists for
# the current event we play it INSTEAD of the spoken `say` voice.
event_audio=""
if [ -n "${CN_EVENT:-}" ]; then
  audio_dir="${HOME}/.claude-notifications/audio/desktop"
  for ext in mp3 m4a aac wav aiff ogg flac; do
    if [ -f "${audio_dir}/${CN_EVENT}.${ext}" ]; then
      event_audio="${audio_dir}/${CN_EVENT}.${ext}"
      break
    fi
  done
fi

# Decide what to speak. Default = title; user can override with custom text or use body.
spoken=""
if [ "$voice_enabled" = "true" ]; then
  if [ -n "$voice_text" ]; then
    spoken="$voice_text"
  else
    style=$(cn_get '.channels.desktop.voice.style')
    case "$style" in
      title) spoken="$title" ;;
      body)  spoken="$body" ;;
      both)  spoken="${title}. ${body}" ;;
      *)     spoken="$title" ;;
    esac
  fi
  # Replace common token shortcuts in the spoken string.
  spoken=$(printf '%s' "$spoken" \
    | sed -e "s/{title}/${title//\//\\/}/g" \
          -e "s/{body}/${body//\//\\/}/g" \
          -e "s/{project}/${CN_PROJECT//\//\\/}/g" \
          -e "s/{event}/${CN_EVENT}/g")
fi

uname_s=$(uname -s 2>/dev/null || echo unknown)

case "$uname_s" in
  Darwin)
    # AppleScript escaping: backslash + double quote.
    esc_title=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g')
    esc_body=$(printf '%s' "$body" | sed 's/\\/\\\\/g; s/"/\\"/g')
    esc_sound=$(printf '%s' "${sound:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if [ -n "$esc_sound" ]; then
      osascript -e "display notification \"${esc_body}\" with title \"${esc_title}\" sound name \"${esc_sound}\"" 2>/dev/null || true
    else
      osascript -e "display notification \"${esc_body}\" with title \"${esc_title}\"" 2>/dev/null || true
    fi
    if [ -n "$event_audio" ] && command -v afplay >/dev/null 2>&1; then
      # Per-event uploaded audio takes precedence over TTS for this event.
      afplay "$event_audio" >/dev/null 2>&1 &
    elif [ "$voice_enabled" = "true" ] && [ -n "$spoken" ] && command -v say >/dev/null 2>&1; then
      # When voice_name is unset we INTENTIONALLY do NOT pass -v, so `say` uses
      # the system voice the user has chosen in System Settings → Accessibility
      # → Spoken Content → System Voice. That's the most natural-sounding voice
      # available — typically a Siri voice (Voice 1-5 / Ava / Tom / etc.) the
      # user picked themselves. Heuristic auto-detection is brittle and can't
      # know the user's preferred accent; respecting their explicit OS choice
      # is the right behavior.
      #
      # Branch instead of building an array — macOS bash 3.2 errors on
      # empty array expansion under `set -u`, so the no-flag case has to be
      # handled separately.
      if [ -n "$voice_name" ] && [ -n "$voice_rate" ]; then
        say -v "$voice_name" -r "$voice_rate" -- "$spoken" >/dev/null 2>&1 &
      elif [ -n "$voice_name" ]; then
        say -v "$voice_name" -- "$spoken" >/dev/null 2>&1 &
      elif [ -n "$voice_rate" ]; then
        say -r "$voice_rate" -- "$spoken" >/dev/null 2>&1 &
      else
        say -- "$spoken" >/dev/null 2>&1 &
      fi
    fi
    ;;
  Linux)
    if command -v notify-send >/dev/null 2>&1; then
      urgency="normal"
      [ "${CN_LEVEL:-}" = "error" ] && urgency="critical"
      [ "${CN_LEVEL:-}" = "warn" ]  && urgency="critical"
      notify-send -u "$urgency" -- "$title" "$body" 2>/dev/null || true
    fi
    if [ -n "$event_audio" ]; then
      for player in paplay aplay mpg123 ffplay; do
        if command -v "$player" >/dev/null 2>&1; then
          "$player" "$event_audio" >/dev/null 2>&1 &
          break
        fi
      done
    elif [ "$voice_enabled" = "true" ] && [ -n "$spoken" ]; then
      if command -v spd-say >/dev/null 2>&1; then
        spd-say -- "$spoken" >/dev/null 2>&1 &
      elif command -v espeak >/dev/null 2>&1; then
        espeak -- "$spoken" >/dev/null 2>&1 &
      fi
    fi
    ;;
  *)
    # Windows / WSL fallback.
    if command -v powershell.exe >/dev/null 2>&1; then
      esc_title=$(printf '%s' "$title" | sed "s/'/''/g")
      esc_body=$(printf '%s' "$body" | sed "s/'/''/g")
      powershell.exe -NoProfile -Command "[reflection.assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('${esc_body}','${esc_title}')" >/dev/null 2>&1 || true
    fi
    ;;
esac

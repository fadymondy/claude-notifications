#!/usr/bin/env bash
# desktop.sh — Native desktop notifications.
# macOS:  osascript display notification + optional `say` voice.
# Linux:  notify-send (libnotify) + optional `spd-say` / `espeak`.
# Windows: non-blocking toast via PowerShell (Git Bash / MSYS / Cygwin / WSL) —
#          BurntToast if installed, else a WinRT ToastNotificationManager
#          toast, else a MessageBox. Runs detached, so this returns at once.
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

# Read every desktop field in ONE jq call — each jq spawn costs ~0.15 s on
# Windows/Git Bash. Fields are joined with \x1f (a non-whitespace IFS, so
# empty fields are kept in place).
voice_enabled="" voice_name="" voice_rate="" voice_text="" sound="" voice_style=""
IFS=$'\x1f' read -r voice_enabled voice_name voice_rate voice_text sound voice_style < <(
  printf '%s' "$CN_CONFIG" | jq -r '
    .channels.desktop // {}
    | [.voice.enabled, .voice.name, .voice.rate, .voice.text, .sound, .voice.style]
    | map(if . == null then "" else tostring | gsub("[\n\u001f]"; " ") end)
    | join("\u001f")
  ' 2>/dev/null
)
[ -n "${CN_VOICE_NAME:-}" ] && voice_name="$CN_VOICE_NAME"
[ -n "${CN_VOICE_RATE:-}" ] && voice_rate="$CN_VOICE_RATE"

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
    case "$voice_style" in
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
    # Windows (Git Bash / MSYS / Cygwin / WSL). Fire-and-forget: PowerShell
    # alone takes ~1 s to start, and notify.sh kills channels after 5 s, so
    # the toast runs fully detached and this script returns immediately.
    # Title/body travel via env vars, so no quoting/escaping is needed.
    ps_exe=""
    for c in powershell.exe pwsh.exe; do
      if command -v "$c" >/dev/null 2>&1; then ps_exe="$c"; break; fi
    done
    if [ -n "$ps_exe" ]; then
      # shellcheck disable=SC2016  # PowerShell source; $vars are PowerShell's
      ps_script='
$t = $env:CN_TOAST_TITLE; $b = $env:CN_TOAST_BODY
if (-not $b) { $b = " " }
try {
  if (Get-Module -ListAvailable -Name BurntToast) {
    Import-Module BurntToast -ErrorAction Stop
    New-BurntToastNotification -Text $t, $b -ErrorAction Stop
    exit 0
  }
} catch {}
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $x = New-Object Windows.Data.Xml.Dom.XmlDocument
  $x.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text/><text/></binding></visual></toast>")
  $n = $x.GetElementsByTagName("text")
  $n.Item(0).AppendChild($x.CreateTextNode($t)) | Out-Null
  $n.Item(1).AppendChild($x.CreateTextNode($b)) | Out-Null
  $app = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($b, $t) | Out-Null
}'
      # Everything below runs in a detached subshell, so even the encoding
      # forks stay off the hook's critical path. -EncodedCommand (UTF-16LE
      # base64) sidesteps MSYS argument mangling.
      (
        ps_args=(-Command "$ps_script")
        if command -v iconv >/dev/null 2>&1 && command -v base64 >/dev/null 2>&1; then
          enc=$(printf '%s' "$ps_script" | iconv -f UTF-8 -t UTF-16LE 2>/dev/null | base64 | tr -d '\r\n')
          [ -n "$enc" ] && ps_args=(-EncodedCommand "$enc")
        fi
        CN_TOAST_TITLE="$title" CN_TOAST_BODY="$body" \
          exec "$ps_exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden "${ps_args[@]}"
      ) </dev/null >/dev/null 2>&1 &
      disown 2>/dev/null || true
    fi
    ;;
esac

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
    if [ "$voice_enabled" = "true" ] && [ -n "$spoken" ] && command -v say >/dev/null 2>&1; then
      # Auto-pick the most natural-sounding voice when the user didn't name one.
      # Order of preference:
      #   1. Premium Siri voices (self-identify as "Hi, I'm Siri!")
      #   2. Voices flagged as (Premium) or (Enhanced)
      #   3. Hand-picked sensible defaults that ship pre-installed
      if [ -z "$voice_name" ]; then
        voice_list=$(say -v '?' 2>/dev/null)
        # Detect the user's locale so we prefer voices in their language first.
        sys_locale=$(defaults read -g AppleLocale 2>/dev/null | tr - _ || true)
        [ -z "$sys_locale" ] && sys_locale="${LANG%.*}"
        [ -z "$sys_locale" ] && sys_locale="en_US"
        lang="${sys_locale%%_*}"

        # `say -v '?'` is column-aligned: long names eat the padding so awk-by-
        # whitespace breaks. Parse with a regex that locates the locale code
        # (e.g. en_US) anywhere on the line, then everything before it is the
        # voice name. Siri voices ALWAYS end the line with "Hi, I'm Siri!" —
        # those are the most natural human-quality voices on macOS, so we want
        # them first regardless of accent.
        pick_voice() {
          # $1 = filter regex applied to the line; $2 = locale-match awk regex
          awk -v filter="$1" -v locre="$2" '
            $0 ~ filter {
              if (match($0, /[a-z][a-z][a-z]?_[A-Z][A-Z][A-Z]?/)) {
                loc = substr($0, RSTART, RLENGTH)
                if (tolower(loc) ~ locre) {
                  name = substr($0, 1, RSTART - 1)
                  sub(/[[:space:]]+$/, "", name)
                  print name
                  exit
                }
              }
            }
          ' <<< "$voice_list"
        }

        # Pass 1: Siri voice in the exact user locale (best — Siri-quality + native accent).
        voice_name=$(pick_voice "Hi, I.m Siri!" "^$(printf '%s' "$sys_locale" | tr '[:upper:]' '[:lower:]')$")
        # Pass 2: Premium/Enhanced in the exact locale.
        [ -z "$voice_name" ] && voice_name=$(pick_voice "\\(Premium\\)|\\(Enhanced\\)" "^$(printf '%s' "$sys_locale" | tr '[:upper:]' '[:lower:]')$")
        # Pass 3: ANY Siri voice in the same language family — Siri quality
        # trumps accent match, since the alternative is robotic Daniel/Samantha.
        [ -z "$voice_name" ] && voice_name=$(pick_voice "Hi, I.m Siri!" "^$(printf '%s' "$lang" | tr '[:upper:]' '[:lower:]')[_-]")
        # Pass 4: any Premium/Enhanced in the language family.
        [ -z "$voice_name" ] && voice_name=$(pick_voice "\\(Premium\\)|\\(Enhanced\\)" "^$(printf '%s' "$lang" | tr '[:upper:]' '[:lower:]')[_-]")
        # Pass 5: ANY Siri voice at all (some users only have Siri voices in
        # one or two languages — better foreign-accent Siri than no Siri).
        [ -z "$voice_name" ] && voice_name=$(pick_voice "Hi, I.m Siri!" ".+")
        # Pass 6: hand-picked good defaults that ship on every macOS.
        if [ -z "$voice_name" ]; then
          for fallback in "Daniel" "Samantha" "Karen" "Moira" "Tom" "Allison"; do
            if printf '%s' "$voice_list" | grep -qE "^${fallback}[[:space:]]"; then
              voice_name="$fallback"; break
            fi
          done
        fi
        cn_log "desktop: auto-selected voice '$voice_name' for locale '$sys_locale'"
      fi
      say_args=()
      [ -n "$voice_name" ] && say_args+=("-v" "$voice_name")
      [ -n "$voice_rate" ] && say_args+=("-r" "$voice_rate")
      say "${say_args[@]}" -- "$spoken" >/dev/null 2>&1 &
    fi
    ;;
  Linux)
    if command -v notify-send >/dev/null 2>&1; then
      urgency="normal"
      [ "${CN_LEVEL:-}" = "error" ] && urgency="critical"
      [ "${CN_LEVEL:-}" = "warn" ]  && urgency="critical"
      notify-send -u "$urgency" -- "$title" "$body" 2>/dev/null || true
    fi
    if [ "$voice_enabled" = "true" ] && [ -n "$spoken" ]; then
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

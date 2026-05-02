# Contributing to claude-notifications

## Local development

```bash
git clone https://github.com/fadymondy/claude-notifications
cd claude-notifications/app
npm install
npm run dev          # vite + electron with hot reload
```

The bash plugin (`scripts/`) has no build step — edit and re-run from inside Claude Code, or invoke directly:

```bash
CLAUDE_PLUGIN_ROOT="$PWD/.." \
  bash scripts/notify.sh manual <<< '{"title":"hi","body":"test"}'
```

## Cutting a release

```bash
# 1. Bump version in app/package.json + .claude-plugin/plugin.json + .claude-plugin/marketplace.json
# 2. Commit
git tag v0.X.Y -a -m "v0.X.Y notes"
git push origin v0.X.Y
```

The release workflow builds dmg / exe / AppImage / deb across macOS, Windows, and Linux on every `v*.*.*` tag and uploads them to a GitHub Release.

## Apple code signing — drop-in secret slots

Code signing and notarization are **opt-in** — when the secrets aren't set, the workflow produces unsigned artifacts (still installable, but with Gatekeeper warnings on macOS and SmartScreen warnings on Windows).

To enable signed + notarized macOS builds, add these repository secrets at **GitHub → Repository Settings → Secrets and variables → Actions**:

### macOS — Developer ID (notarized DMG / outside-App-Store distribution)

| Secret name                       | What it is                                                                 |
|-----------------------------------|----------------------------------------------------------------------------|
| `MAC_CERTS`                       | Base64-encoded `.p12` containing your **Developer ID Application** cert |
| `MAC_CERTS_PASSWORD`              | Password for the `.p12` above                                              |
| `APPLE_ID`                        | The Apple ID email of your Apple Developer account                         |
| `APPLE_APP_SPECIFIC_PASSWORD`     | App-specific password from https://appleid.apple.com (for notarization)   |
| `APPLE_TEAM_ID`                   | Your 10-character Team ID (e.g. `ABCDE12345`)                              |

To export your `.p12` from Keychain Access:
1. Keychain Access → **My Certificates** → right-click your "Developer ID Application: …" cert → **Export…**
2. Save as `.p12` with a password
3. `base64 -i developer-id.p12 | pbcopy` → paste as `MAC_CERTS`

### macOS — Mac App Store (.pkg, App Store Connect submission)

The MAS build is **gated behind a repository variable**: set **GitHub → Repository Settings → Secrets and variables → Actions → Variables → `ENABLE_MAS_BUILD = true`** to turn it on. Then add:

| Secret name                          | What it is                                                          |
|--------------------------------------|---------------------------------------------------------------------|
| `MAS_CERTS`                          | Base64 `.p12` of **3rd Party Mac Developer Application** cert     |
| `MAS_CERTS_PASSWORD`                 | Password for `MAS_CERTS`                                            |
| `MAS_INSTALLER_CERTS_PASSWORD`       | Password for the **3rd Party Mac Developer Installer** cert        |
| `MAS_PROVISIONING_PROFILE`           | Base64-encoded `.provisionprofile` from App Store Connect           |

### Windows code signing (optional)

| Secret name              | What it is                           |
|--------------------------|--------------------------------------|
| `WIN_CERTS`              | Base64-encoded `.pfx` certificate    |
| `WIN_CERTS_PASSWORD`     | Password for `WIN_CERTS`             |

### Smoke-test the credentials locally

Before pushing a tag, you can dry-run the build on your own Mac:

```bash
cd app
export CSC_LINK="/path/to/developer-id.p12"
export CSC_KEY_PASSWORD="..."
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run dist:mac -- --publish never
```

If the build finishes and `dist/` contains a notarized `.dmg`, the secrets are valid.

## Auto-update

When a release is published with `latest-mac.yml` / `latest.yml` / `latest-linux.yml` metadata files (electron-builder generates these automatically), the in-app updater picks them up on next launch and offers to download.

To verify a release ships the metadata:

```bash
gh release view vX.Y.Z --repo fadymondy/claude-notifications --json assets | jq '.assets[].name'
# Should include latest-mac.yml, latest.yml, latest-linux.yml.
```

If they're missing, the workflow uploaded only installers — re-run the release job or manually upload the YML files generated under `app/dist/`.

## Local sanity check before opening a PR

```bash
# Bash plugin
shellcheck --severity=warning scripts/notify.sh scripts/lib/*.sh scripts/channels/*.sh

# Electron app
cd app
npm run lint        # node -c on every JS file
npm test            # smoke tests for icon / config / channels
npm run build:renderer  # vite build sanity check
npm run icons       # regenerate dock/installer icons from app-icon.svg
```

CI runs the same checks on every push.

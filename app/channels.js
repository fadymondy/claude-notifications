// Channel metadata used by the renderer to build forms and by the main process
// to validate config + run test sends. Shape = single source of truth.

const channels = [
  {
    id: 'desktop',
    label: 'Desktop',
    summary: 'Native banners + spoken alerts using your macOS System Voice (or Linux/Windows native equivalents).',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle', default: true },
      { key: 'sound', label: 'Sound name (macOS)', type: 'text', placeholder: 'Funk' },
      { key: 'voice.enabled', label: 'Speak the notification', type: 'toggle' },
      { key: 'voice.name', label: 'Voice name (override)', type: 'text', placeholder: '(blank = your macOS System Voice)', help: 'Leave blank to use the voice you picked in System Settings → Accessibility → Spoken Content → System Voice. Otherwise enter an exact name from `say -v ?`.' },
      { key: 'voice.rate', label: 'Speech rate (wpm)', type: 'number', placeholder: '180' },
      { key: 'voice.style', label: 'What to speak', type: 'select', options: ['title', 'body', 'both'], default: 'title' },
      { key: 'voice.text', label: 'Custom template (optional)', type: 'text', placeholder: '{title}. {body}', help: '{title} {body} {project} {event} are substituted.' },
    ],
    setup: [
      { title: 'Nothing to install', detail: 'Desktop notifications work out of the box — macOS uses osascript, Linux uses notify-send, Windows uses PowerShell toast. Just enable above.' },
      { title: 'Pick your spoken voice', detail: 'On macOS, the most natural voices are Siri voices. Open System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, then download a Siri voice in your preferred accent (Voice 1–5, Ava, Tom, Zoe, etc.).', linkLabel: 'Open Voice settings', linkAction: 'open-voice-settings' },
      { title: 'Enable speaking', detail: 'Tick "Speak the notification" above and choose what gets spoken: title (short), body (long), both, or your own template.' },
      { title: 'Test it', detail: 'Click "Send test" — you should hear your selected voice and see a banner.' },
    ],
  },
  {
    id: 'slack',
    label: 'Slack',
    summary: 'Posts to a Slack channel via Incoming Webhook.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'webhook_url', label: 'Webhook URL', type: 'password', placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'channel', label: 'Channel override', type: 'text', placeholder: '#claude' },
      { key: 'username', label: 'Display name', type: 'text', placeholder: 'Claude Code' },
    ],
    setup: [
      { title: 'Open Slack API apps', detail: 'Sign in to your workspace and go to Slack API → Your Apps. Click "Create New App" → "From scratch". Name it "Claude Code" and pick your workspace.', linkLabel: 'Open api.slack.com/apps', link: 'https://api.slack.com/apps' },
      { title: 'Activate Incoming Webhooks', detail: 'In your new app, click "Incoming Webhooks" in the sidebar and toggle "Activate Incoming Webhooks" on.' },
      { title: 'Add a webhook to a channel', detail: 'Scroll down, click "Add New Webhook to Workspace", pick the channel where Claude notifications should land, then click Allow.' },
      { title: 'Paste the URL above', detail: 'Slack shows a URL like `https://hooks.slack.com/services/T.../B.../...`. Copy it into the Webhook URL field above.' },
      { title: 'Test', detail: 'Click "Send test" — a message should appear in the channel within a second or two.' },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    summary: 'Posts to a Discord channel via webhook.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'webhook_url', label: 'Webhook URL', type: 'password', placeholder: 'https://discord.com/api/webhooks/...' },
      { key: 'username', label: 'Display name', type: 'text', placeholder: 'Claude Code' },
    ],
    setup: [
      { title: 'Open server settings', detail: 'In Discord, right-click the server (or click the dropdown next to the server name) → Server Settings → Integrations.' },
      { title: 'Create a webhook', detail: 'Click "Webhooks" → "New Webhook". Name it "Claude Code" and pick the channel where notifications should arrive.' },
      { title: 'Copy the webhook URL', detail: 'Click "Copy Webhook URL". The URL looks like `https://discord.com/api/webhooks/.../...`.' },
      { title: 'Paste above and test', detail: 'Drop the URL into the Webhook URL field, save, and click "Send test".' },
    ],
  },
  {
    id: 'email',
    label: 'Email',
    summary: 'Email via SMTP (Gmail, Mailgun, SendGrid SMTP) or local sendmail.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'transport', label: 'Transport', type: 'select', options: ['smtp', 'sendmail'], default: 'smtp' },
      { key: 'smtp_url', label: 'SMTP URL', type: 'text', placeholder: 'smtps://smtp.gmail.com:465' },
      { key: 'smtp_user', label: 'SMTP user', type: 'text', placeholder: 'you@gmail.com' },
      { key: 'smtp_password', label: 'SMTP password', type: 'password', help: 'Gmail: create an App Password.' },
      { key: 'from', label: 'From', type: 'text', placeholder: 'Claude <you@gmail.com>' },
      { key: 'to', label: 'Recipients', type: 'list', placeholder: 'one address per line' },
    ],
    setup: [
      { title: 'Pick a transport', detail: 'Use `smtp` (works with any provider — Gmail, Mailgun, SendGrid, your office IMAP, etc.) or `sendmail` if your machine has a local mail relay configured.' },
      { title: 'Gmail: enable an App Password', detail: 'If you use Gmail, you need 2-Factor Auth enabled on your Google account, then create an app-specific password. Use that password — not your normal Gmail password — in the SMTP password field.', linkLabel: 'Open Google App Passwords', link: 'https://myaccount.google.com/apppasswords' },
      { title: 'Fill SMTP fields', detail: 'For Gmail: SMTP URL = `smtps://smtp.gmail.com:465`, SMTP user = your gmail address, password = the app password above. For other providers, see their docs.' },
      { title: 'Add recipients', detail: 'List one email per line in the Recipients field. The plugin sends each notification to all of them.' },
      { title: 'Test', detail: 'Click "Send test" — check your inbox (and spam folder the first time).' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    summary: 'WhatsApp via CallMeBot (free, personal use) or Twilio (production).',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'provider', label: 'Provider', type: 'select', options: ['callmebot', 'twilio'], default: 'callmebot' },
      { key: 'callmebot.phone', label: 'CallMeBot phone', type: 'text', placeholder: '+201XXXXXXXXX', showWhen: { 'provider': 'callmebot' } },
      { key: 'callmebot.apikey', label: 'CallMeBot apikey', type: 'password', help: "Text 'I allow callmebot to send me messages' to +34 644 51 95 23.", showWhen: { 'provider': 'callmebot' } },
      { key: 'twilio.account_sid', label: 'Twilio Account SID', type: 'text', showWhen: { 'provider': 'twilio' } },
      { key: 'twilio.auth_token', label: 'Twilio Auth Token', type: 'password', showWhen: { 'provider': 'twilio' } },
      { key: 'twilio.from', label: 'Twilio from', type: 'text', placeholder: 'whatsapp:+14155238886', showWhen: { 'provider': 'twilio' } },
      { key: 'twilio.to', label: 'Twilio recipients', type: 'list', placeholder: 'whatsapp:+201XXXXXXXXX', showWhen: { 'provider': 'twilio' } },
    ],
    setup: [
      { title: 'CallMeBot — free path (personal use)', detail: 'In WhatsApp, save the contact +34 644 51 95 23. Send the exact message: "I allow callmebot to send me messages". Wait for an automated reply with your apikey (usually within 2 minutes).', providerWhen: 'callmebot' },
      { title: 'Paste your phone + apikey', detail: 'Phone is your full WhatsApp number with + and country code (e.g. +201001234567). Apikey is what CallMeBot just sent you.', providerWhen: 'callmebot' },
      { title: 'Twilio — production path', detail: 'Sign up at twilio.com (free trial includes a sandbox). In Console → Messaging → Try it out → Send a WhatsApp message, follow the instructions to join the sandbox from your phone.', linkLabel: 'Open Twilio Console', link: 'https://console.twilio.com/', providerWhen: 'twilio' },
      { title: 'Copy SID + auth token', detail: 'On the Twilio Console dashboard, copy your Account SID and Auth Token into the fields above.', providerWhen: 'twilio' },
      { title: 'Set the from / to numbers', detail: 'From = the Twilio sandbox number (`whatsapp:+14155238886` for the default sandbox). Recipients = your verified WhatsApp numbers, formatted `whatsapp:+201XXXXXXXXX` (one per line).', providerWhen: 'twilio' },
      { title: 'Test', detail: 'Click "Send test" — a WhatsApp message should arrive within seconds.' },
    ],
  },
  {
    id: 'webpush',
    label: 'Web / Phone Push',
    summary: 'Push to phone or browser via ntfy.sh, Pushover, or your own server.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'provider', label: 'Provider', type: 'select', options: ['ntfy', 'pushover', 'webhook'], default: 'ntfy' },
      { key: 'ntfy.server', label: 'ntfy server', type: 'text', placeholder: 'https://ntfy.sh', showWhen: { 'provider': 'ntfy' } },
      { key: 'ntfy.topic', label: 'ntfy topic', type: 'text', placeholder: 'claude-yourname-RANDOM', help: 'Pick anything unique. Subscribe to the same topic in the ntfy app on your phone.', showWhen: { 'provider': 'ntfy' } },
      { key: 'ntfy.priority', label: 'Priority (1-5)', type: 'number', placeholder: '3', showWhen: { 'provider': 'ntfy' } },
      { key: 'ntfy.token', label: 'Bearer token (optional)', type: 'password', showWhen: { 'provider': 'ntfy' } },
      { key: 'pushover.user_key', label: 'Pushover user key', type: 'password', showWhen: { 'provider': 'pushover' } },
      { key: 'pushover.app_token', label: 'Pushover app token', type: 'password', showWhen: { 'provider': 'pushover' } },
      { key: 'webhook.url', label: 'Webhook URL', type: 'text', showWhen: { 'provider': 'webhook' } },
    ],
    setup: [
      { title: 'ntfy — fastest, no signup', detail: 'Pick a unique topic name (e.g. `claude-yourname-7a2d9c8f`). The harder to guess, the more private — anyone who knows the topic can subscribe.', providerWhen: 'ntfy' },
      { title: 'Install the ntfy app', detail: 'On iOS or Android, install the ntfy app, tap the + button, and subscribe to your topic. Or open `https://ntfy.sh/<topic>` in any browser to get web push.', linkLabel: 'Open ntfy.sh', link: 'https://ntfy.sh', providerWhen: 'ntfy' },
      { title: 'Paste topic above', detail: 'Drop the topic name into the field. Keep server as `https://ntfy.sh` unless you self-host. Optional: set priority 1 (low) to 5 (urgent + bypass DND).', providerWhen: 'ntfy' },
      { title: 'Pushover — paid, but reliable', detail: 'Buy a Pushover license per platform ($5 one-time). Create an "Application" in your dashboard to get an app_token. Your account gives you a user_key.', linkLabel: 'Open Pushover', link: 'https://pushover.net/', providerWhen: 'pushover' },
      { title: 'Custom webhook — bring your own', detail: 'POST a normalized JSON `{title, body, level, event, project}` to any URL you control. Useful if you have an internal push gateway.', providerWhen: 'webhook' },
      { title: 'Test', detail: 'Click "Send test" — your phone or browser should buzz.' },
    ],
  },
  {
    id: 'webhook',
    label: 'Generic Webhook',
    summary: 'POSTs a normalized JSON payload (with optional HMAC signature) to your endpoint.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'urls', label: 'URLs', type: 'list', placeholder: 'https://api.example.com/claude/notify' },
      { key: 'method', label: 'HTTP method', type: 'select', options: ['POST', 'PUT'], default: 'POST' },
      { key: 'auth_header', label: 'Authorization header', type: 'password', placeholder: 'Bearer xxxxx' },
      { key: 'secret', label: 'HMAC secret', type: 'password', help: 'Adds X-Claude-Signature: sha256=<hex> to every request.' },
    ],
    setup: [
      { title: 'Stand up an endpoint', detail: 'Anything that accepts JSON over HTTP works — a serverless function (Vercel/Cloudflare Worker/Lambda), an internal microservice, an n8n/Zapier/Make.com webhook, etc.' },
      { title: 'Payload contract', detail: 'You will receive a JSON body with keys: `event`, `title`, `body`, `level`, `project`, `cwd`, `session_id`, `tool`, `timestamp`. Use whichever you need.' },
      { title: 'Optional: verify with HMAC', detail: 'Set a shared secret above. The plugin signs each request with `X-Claude-Signature: sha256=<hex>` (HMAC-SHA256 over the raw JSON body). Verify on your end before trusting the payload.' },
      { title: 'Optional: auth header', detail: 'Add `Bearer <token>` in the Authorization header field if your endpoint requires auth. The plugin sends it as the standard `Authorization` header.' },
      { title: 'Test', detail: 'Click "Send test" and check your endpoint logs.' },
    ],
  },
];

const events = [
  { id: 'notification',  label: 'Notification (Claude waiting for input)' },
  { id: 'stop',          label: 'Stop (turn finished)' },
  { id: 'subagent-stop', label: 'Subagent stop' },
  { id: 'session-start', label: 'Session start' },
  { id: 'session-end',   label: 'Session end' },
  { id: 'user-prompt',   label: 'User prompt submitted' },
  { id: 'pre-tool',      label: 'Tool starting (noisy)' },
  { id: 'post-tool',     label: 'Tool finished (noisy)' },
  { id: 'manual',        label: 'Manual /notify' },
];

const defaultEvents = ['notification', 'stop', 'subagent-stop', 'manual'];

module.exports = { channels, events, defaultEvents };

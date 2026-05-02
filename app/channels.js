// Channel metadata used by the renderer to build forms and by the main process
// to validate config + run test sends. Shape = single source of truth.

const channels = [
  {
    id: 'desktop',
    label: 'Desktop',
    summary: 'Native banners + optional voice via macOS `say` / Linux `spd-say`.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle', default: true },
      { key: 'sound', label: 'Sound name (macOS)', type: 'text', placeholder: 'Funk' },
      { key: 'voice.enabled', label: 'Speak the notification', type: 'toggle' },
      { key: 'voice.name', label: 'Voice name (override)', type: 'text', placeholder: '(blank = your macOS System Voice)', help: 'Leave blank to use the voice you picked in System Settings → Accessibility → Spoken Content → System Voice. Otherwise enter an exact name from `say -v ?`.' },
      { key: 'voice.rate', label: 'Speech rate (wpm)', type: 'number', placeholder: '180' },
      { key: 'voice.style', label: 'What to speak', type: 'select', options: ['title', 'body', 'both'], default: 'title' },
      { key: 'voice.text', label: 'Custom template (optional)', type: 'text', placeholder: '{title}. {body}', help: '{title} {body} {project} {event} are substituted.' },
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
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    summary: 'WhatsApp via CallMeBot (free) or Twilio (production).',
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

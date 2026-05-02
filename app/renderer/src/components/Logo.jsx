// Branded SVG logo. Rendered inline as a React component so we can size it
// freely and so it ships with the JS bundle (no separate asset to load).

export function Logo({ size = 40, className = '', muted = false }) {
  const id = `cn-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Claude Notifications"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-bell`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={muted ? '#9aa3b2' : '#ff8a3d'} />
          <stop offset="100%" stopColor={muted ? '#5b6473' : '#d96027'} />
        </linearGradient>
        <linearGradient id={`${id}-dot`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff5c63" />
          <stop offset="100%" stopColor="#c2293f" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.18" />
        </filter>
      </defs>

      <circle cx="32" cy="34" r="26" fill="none" stroke={`url(#${id}-bell)`} strokeOpacity="0.18" strokeWidth="2" />

      <g filter={`url(#${id}-shadow)`}>
        <rect x="29" y="9" width="6" height="6" rx="2" fill={`url(#${id}-bell)`} />
        <path
          d="M16 41 L16 29 C16 22 20 16 26 14.5 A6 6 0 0 1 38 14.5 C44 16 48 22 48 29 L48 41 L51 45 A1.5 1.5 0 0 1 49.5 47 L14.5 47 A1.5 1.5 0 0 1 13 45 Z"
          fill={`url(#${id}-bell)`}
        />
        <path
          d="M22 28 C22 22 26 18 32 18 C32 18 28 21 26 26 C24.5 30 24 35 24 38 Z"
          fill="#fff"
          fillOpacity="0.18"
        />
        <ellipse cx="32" cy="52" rx="4" ry="3.5" fill={`url(#${id}-bell)`} />
      </g>

      <circle cx="48" cy="14" r="8" fill={`url(#${id}-dot)`} />
      <circle cx="48" cy="14" r="8" fill="none" stroke="#0f1115" strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="48" cy="14" r="2.5" fill="#fff" fillOpacity="0.85" />
    </svg>
  );
}

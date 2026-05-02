// Branded logo — Boxicons bxs-bell shape (same path as the tray icon),
// rendered in the brand primary color via `currentColor` so it picks up the
// theme's accent. A small notification dot in the destructive/red shade keeps
// the brand mark distinct from a generic bell icon.
//
// Single-color flat fill matches the lucide-react iconography used elsewhere
// in the UI — no gradients or drop shadows, so the logo blends with the
// channel icons in the sidebar.

export function Logo({ size = 40, className = '', withDot = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Claude Notifications"
      className={className}
      style={{ color: 'hsl(var(--primary))' }}
    >
      {/* Boxicons bxs-bell path (MIT, atisawd/boxicons) */}
      <path
        fill="currentColor"
        d="M12 22c1.103 0 2-.897 2-2h-4c0 1.103.897 2 2 2zm7-7.414V10c0-3.217-2.185-5.927-5.145-6.742C13.562 2.52 12.846 2 12 2s-1.562.52-1.855 1.258C7.185 4.073 5 6.783 5 10v4.586l-1.707 1.707A.996.996 0 0 0 3 17v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-1a.996.996 0 0 0-.293-.707L19 14.586z"
      />
      {withDot && (
        <>
          {/* Notification badge — small destructive-colored dot in the upper-right.
              Stroke matches the card background so the dot reads as floating
              over the bell rather than glued to it. */}
          <circle cx="18.5" cy="5.5" r="3.5" fill="hsl(var(--destructive))" />
          <circle
            cx="18.5"
            cy="5.5"
            r="3.5"
            fill="none"
            stroke="hsl(var(--card))"
            strokeWidth="1.2"
          />
        </>
      )}
    </svg>
  );
}

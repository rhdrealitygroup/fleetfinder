// LotCompass brand mark — a compass needle inside a broken crosshair ring.
// Vector so it's crisp at any size and adapts to the warm palette.
// Colors: charcoal #1c1917, terracotta #b85c1e, taupe star #cabfb0.
export function CompassMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* crosshair ring */}
      <circle cx="32" cy="32" r="24.5" stroke="#1c1917" strokeWidth="2.4" />
      <g stroke="#1c1917" strokeWidth="2.4" strokeLinecap="round">
        <line x1="32" y1="3.5" x2="32" y2="11.5" />
        <line x1="32" y1="52.5" x2="32" y2="60.5" />
        <line x1="3.5" y1="32" x2="11.5" y2="32" />
        <line x1="52.5" y1="32" x2="60.5" y2="32" />
      </g>
      {/* compass-rose star */}
      <path d="M32 13 L34.5 32 L32 51 L29.5 32 Z" fill="#cabfb0" />
      <path d="M13 32 L32 29.5 L51 32 L32 34.5 Z" fill="#cabfb0" />
      {/* two-tone needle */}
      <g transform="rotate(38 32 32)">
        <polygon points="32,16 35.5,32 28.5,32" fill="#b85c1e" />
        <polygon points="32,48 35.5,32 28.5,32" fill="#1c1917" />
      </g>
      {/* hub */}
      <circle cx="32" cy="32" r="4" fill="#f6f4ef" stroke="#1c1917" strokeWidth="2" />
      <circle cx="32" cy="32" r="1.5" fill="#1c1917" />
    </svg>
  );
}

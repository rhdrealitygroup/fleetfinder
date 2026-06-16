// Hero compass rose for the "Navigation Chart" landing — a crisp, drawn vector
// (NOT the small nav mark). Layers: fine degree-tick ring, thin inner ring,
// bold cardinal ticks, a taupe 8-point star, a two-tone needle (rust north /
// charcoal south), and a hub. No rust "pin arc" — removed per brand direction;
// the only rust is the needle's north tip.
export function CompassRose({ className, size = 560 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      className={className}
      style={{ overflow: "visible", maxWidth: "100%" }}
      aria-hidden="true"
    >
      {/* fine degree-tick ring */}
      <circle cx="200" cy="200" r="184" fill="none" stroke="#221d16" strokeWidth="9" strokeDasharray="2 7.55" opacity=".85" />
      {/* thin inner ring */}
      <circle cx="200" cy="200" r="166" fill="none" stroke="#221d16" strokeWidth="1.4" opacity=".4" />
      {/* bold cardinal ticks crossing the ring */}
      <g stroke="#221d16" strokeWidth="6" strokeLinecap="round">
        <line x1="200" y1="166" x2="200" y2="202" />
        <line x1="200" y1="234" x2="200" y2="198" />
        <line x1="166" y1="200" x2="202" y2="200" />
        <line x1="234" y1="200" x2="198" y2="200" />
      </g>
      {/* taupe 8-point star */}
      <g fill="#c4b29a">
        <polygon points="200,52 208,148 200,200 192,148" />
        <polygon points="200,348 208,252 200,200 192,252" />
        <polygon points="52,200 148,208 200,200 148,192" />
        <polygon points="348,200 252,208 200,200 252,192" />
      </g>
      <g fill="#cdbca6">
        <polygon points="276,124 203.5,203.5 196.5,196.5" />
        <polygon points="124,276 203.5,203.5 196.5,196.5" />
        <polygon points="124,124 203.5,196.5 196.5,203.5" />
        <polygon points="276,276 203.5,196.5 196.5,203.5" />
      </g>
      {/* two-tone needle (NE rust / SW charcoal) */}
      <polygon points="289,111 212,212 188,188" fill="#bb3b0e" />
      <polygon points="111,289 212,212 188,188" fill="#221d16" />
      {/* hub */}
      <circle cx="200" cy="200" r="20" fill="#fbf4ea" />
      <circle cx="200" cy="200" r="8.5" fill="#221d16" />
    </svg>
  );
}

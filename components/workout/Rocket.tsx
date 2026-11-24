/*
 * The rocket of the rest transition, drawn in line: ink strokes, white fill where it has to
 * cover the clouds behind it, and the flame in red, the only colour. The nose is at the very top
 * of the drawing (it marks where the routine is on the rail).
 * The flame (`.rocket-flame`) scales from the nozzle; CloudTransition makes it flicker in flight.
 */

import type { CSSProperties } from 'react';

const INK = '#131313';
const RED = '#ff3b30';

export function Rocket({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 560"
      aria-hidden="true"
      className={className}
      style={style}
      fill="#fff"
      stroke={INK}
      strokeWidth={2.25}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* flame: red outside, a white core; behind the nozzle */}
      <g className="rocket-flame" stroke="none">
        <path d="M44 450 C44 480 51 512 60 556 C69 512 76 480 76 450 Z" fill={RED} />
        <path d="M54.5 451 C54.5 466 57 483 60 500 C63 483 65.5 466 65.5 451 Z" fill="#fff" />
      </g>

      {/* side fins, behind the body */}
      <path d="M41 352 C33 374 22 398 17 436 L17 452 L41 434 Z" />
      <path d="M79 352 C87 374 98 398 103 436 L103 452 L79 434 Z" />

      {/* nozzle */}
      <path d="M48 434 L72 434 L77 452 L43 452 Z" />
      <path d="M45.5 443 L74.5 443" strokeWidth={1.25} />

      {/* body */}
      <rect x="41" y="118" width="38" height="318" rx="2.5" />
      {/* a thin line down one side gives it volume */}
      <path d="M72.5 140 L72.5 424" strokeWidth={1.1} strokeOpacity={0.35} />
      {/* bands: under the fairing and at the interstage */}
      <path d="M41 132 L79 132" strokeWidth={1.4} />
      <path d="M41 284 L79 284" strokeWidth={1.4} />
      <path d="M41 294 L79 294" strokeWidth={1.4} />
      {/* porthole */}
      <circle cx="60" cy="176" r="8.5" />
      <path d="M55.6 173.4 A5 5 0 0 1 61.4 171" fill="none" strokeWidth={1.2} />

      {/* nose cone (payload fairing) */}
      <path d="M41 118 C41 72 50 34 60 8 C70 34 79 72 79 118 Z" />

      {/* the front fin, seen edge-on */}
      <path d="M58.3 390 L61.7 390 L62.8 454 L57.2 454 Z" />
    </svg>
  );
}

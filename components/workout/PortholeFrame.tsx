import type { CSSProperties, ReactNode, RefObject } from 'react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { DAWN } from '@/components/workout/dawnScene';
import { zoomLines, type Circle } from '@/components/workout/assembly';

/*
 * The creator's portholes (phone): the steel rim with its rivets round a round glass, and the two
 * dashed "zoom" lines from a porthole down to the rocket's own small window (it is that window
 * seen close up). Used by the questions' scene (AssemblyScene) and by the start screen's ending
 * (LaunchFinale).
 */

/** The porthole's steel rim with its rivets, the glass (`children` inside it) and a glint. */
export function PortholeFrame({ r, rim, children }: { r: number; rim: number; children: ReactNode }) {
  const R = r + rim;
  const rivets = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="absolute inset-0 h-full w-full overflow-visible">
        <circle r={R} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={2} />
        {rivets.map((a) => (
          <circle key={a} cx={(r + rim / 2) * Math.cos(a)} cy={(r + rim / 2) * Math.sin(a)} r={Math.max(1.2, r * 0.03)} fill={DAWN.steel} />
        ))}
      </svg>
      <div className="absolute overflow-hidden rounded-full" style={{ left: rim, top: rim, width: 2 * r, height: 2 * r }}>
        {children}
      </div>
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <circle r={r} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
      </svg>
    </div>
  );
}

/**
 * The two dashed lines from a porthole (`big`: its outer circle, rim included) to the rocket's
 * small window (`small`), and a ring on the window. `light`: white (on a dark sky), else ink.
 * An SVG over the whole box `W` × `H` it is drawn in.
 */
export function ZoomLinesSvg({
  W,
  H,
  big,
  small,
  light,
  svgRef,
  className = '',
  style,
  stroke,
}: {
  W: number;
  H: number;
  big: Circle;
  small: Circle;
  light: boolean;
  svgRef?: RefObject<SVGSVGElement | null>;
  className?: string;
  style?: CSSProperties;
  /** the lines' colour transition (CSS), if any */
  stroke?: string;
}) {
  const lines = zoomLines(big, small);
  const colour = light ? '#ffffff' : C.ink;
  const op = light ? 0.75 : 0.55;
  return (
    <svg ref={svgRef} aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={`pointer-events-none absolute left-0 top-0 ${className}`} style={style}>
      <g style={{ stroke: colour, transition: stroke }} strokeOpacity={op} strokeWidth={1.3} fill="none">
        {lines.map(([x1, y1, x2, y2], i) => (
          <path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} strokeDasharray="5 4" />
        ))}
        <circle cx={small.x} cy={small.y} r={small.r} strokeOpacity={Math.min(1, op + 0.2)} strokeWidth={1.4} />
      </g>
    </svg>
  );
}

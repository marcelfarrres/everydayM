import type { CSSProperties } from 'react';
import { PAD_COLORS as C, type PadRocketGeometry } from '@/components/workout/padRocketShape';
import { AntennaPart, FinsPart, FlameLayers, NosePart, NozzlePart, RivetsPart, TailPart, WindowPart } from '@/components/workout/RocketParts';
import { f1 } from '@/components/workout/rocketPaths';

/*
 * The new rocket (first screen, phone): pure SVG, line drawing with flat two-tone shading, after
 * the approved drawings. Lying down, nose to the right, in the box of its geometry (padRocket.ts);
 * the flame reaches out to the left of the box (overflow visible).
 *
 * Each part is its own group with `data-part` (flame, nozzle, fins, fin-top, fin-bottom, hull,
 * tail, rivets, hatch, hatch-door, nose, window, antenna, label), so a later screen can hide one or
 * animate it on its own (the player's fins popping out of the hull). `parts` hides them here.
 *
 * No ids and no patterns: the creator flies copies of its rockets (a clone of the DOM without ids),
 * and a copy must look the same. The flame group carries `data-rocket-flame`, which the copy and
 * the creator's jokes use to light it or put it out.
 */

export interface PadRocketParts {
  flame?: boolean;
  fins?: boolean;
  hatch?: boolean;
  window?: boolean;
  antenna?: boolean;
}

export interface PadRocketProps {
  g: PadRocketGeometry;
  /** the label written in the hull (already fitted: fitLabel), or none */
  label?: { text: string; px: number } | null;
  /** how lit the engine is, 0 (out) to 1 (full) */
  flame?: number;
  /** the crew hatch open (also `data-hatch-open` on any ancestor) */
  hatchOpen?: boolean;
  parts?: PadRocketParts;
  className?: string;
  style?: CSSProperties;
}

const FONT = 'var(--font-display), var(--font-geist-sans), system-ui, sans-serif';

export function PadRocket({ g, label, flame = 0, hatchOpen = false, parts = {}, className = '', style }: PadRocketProps) {
  const { T, Tf, cy, stroke: sw } = g;
  const { x0, x1, top, bottom } = g.body;
  const show = { flame: true, fins: true, hatch: true, window: true, antenna: true, ...parts };
  const lit = Math.min(1, Math.max(0, flame));

  const inner = { top: top + sw / 2, bottom: bottom - sw / 2 };
  const rivetR = f1(Math.max(0.8, 0.025 * Tf));
  const rivetGap = f1(0.2 * Tf);
  const hatch = g.hatch;
  const w = g.window;

  return (
    <svg
      aria-hidden="true"
      width={g.W}
      height={g.H}
      viewBox={`0 0 ${g.W} ${g.H}`}
      className={className}
      style={{ overflow: 'visible', ...style }}
      data-hatch-open={hatchOpen ? '' : undefined}
    >
      {show.flame && (
        <g data-part="flame" data-rocket-flame="" style={{ transformOrigin: `0px ${cy}px`, transform: `scale(${lit}, ${f1(0.55 + 0.45 * lit)})` }}>
          <g className="pad-flicker" style={{ transformOrigin: `0px ${cy}px` }}>
            <FlameLayers x={0} cy={cy} along={Tf} across={Tf} />
          </g>
        </g>
      )}
      <g stroke={C.ink} strokeLinejoin="round">
        <NozzlePart x0={x0} xm={0} cy={cy} Tf={Tf} sw={sw} />
        {show.fins && <FinsPart fin={g.fin} top={top} bottom={bottom} sw={sw} />}
        <g data-part="hull">
          <rect x={x0} y={top} width={f1(x1 - x0 + 1)} height={T} rx={f1(Math.min(5, 0.09 * Tf))} fill={C.hull} strokeWidth={sw} />
          <rect x={x0 + sw / 2} y={g.belly.light} width={f1(x1 - x0)} height={f1(g.belly.dark - g.belly.light)} fill={C.shade} stroke="none" />
          <rect x={x0 + sw / 2} y={g.belly.dark} width={f1(x1 - x0)} height={f1(inner.bottom - g.belly.dark)} fill={C.shadeDark} stroke="none" />
          <path d={`M${f1(g.label.x0)} ${f1(top + 0.12 * Tf)}H${f1(g.seam.x - 0.1 * Tf)}`} stroke={C.shadeDark} strokeWidth={1} fill="none" />
        </g>
        <TailPart ring={g.ring} band={g.band} checker={g.checker} top={top} T={T} inner={inner} sw={sw} />
        <RivetsPart seamX={g.seam.x} rivetX={g.seam.x + 0.04 * Tf + g.seam.rivetW / 2} inner={inner} r={rivetR} gap={rivetGap} inset={0.12 * Tf} />
        {show.hatch && hatch && (
          <g data-part="hatch">
            {/* the inside of the cabin, seen when the door opens */}
            <rect x={hatch.x} y={hatch.y} width={hatch.w} height={hatch.h} rx={f1(hatch.w * 0.27)} fill={C.ink} stroke="none" />
            <rect x={f1(hatch.x + hatch.w * 0.25)} y={f1(hatch.y + hatch.h * 0.18)} width={f1(hatch.w * 0.5)} height={f1(hatch.h * 0.22)} rx={1} fill={C.rib} stroke="none" opacity={0.6} />
            <g data-part="hatch-door" className="pad-door" style={{ transformOrigin: `${hatch.x}px ${cy}px` }}>
              <rect x={hatch.x} y={hatch.y} width={hatch.w} height={hatch.h} rx={f1(hatch.w * 0.27)} fill={C.hull} strokeWidth={Math.max(1, sw * 0.65)} />
              {g.belly.light < hatch.y + hatch.h && (
                <rect
                  x={f1(hatch.x + 1)}
                  y={g.belly.light}
                  width={f1(hatch.w - 2)}
                  height={f1(Math.max(0, hatch.y + hatch.h - 1.2 - g.belly.light))}
                  fill={C.shade}
                  stroke="none"
                />
              )}
              <path d={`M${f1(hatch.x + hatch.w * 0.73)} ${f1(cy - 0.07 * Tf)}V${f1(cy + 0.07 * Tf)}`} strokeWidth={Math.max(1.4, sw)} strokeLinecap="round" />
              <circle cx={f1(hatch.x + hatch.w * 0.14)} cy={f1(hatch.y + hatch.h * 0.17)} r={rivetR} fill={C.ink} stroke="none" />
              <circle cx={f1(hatch.x + hatch.w * 0.14)} cy={f1(hatch.y + hatch.h * 0.83)} r={rivetR} fill={C.ink} stroke="none" />
            </g>
          </g>
        )}
        <NosePart x1={x1} top={top} bottom={bottom} cy={cy} T={T} Tf={Tf} sw={sw} />
        {show.window && <WindowPart w={w} sw={sw} />}
        {show.antenna && <AntennaPart x0={g.antenna.x0} x1={g.antenna.x1} light={g.antenna.light} cy={cy} Tf={Tf} sw={sw} />}
      </g>
      {label && label.text && (
        <text
          data-part="label"
          x={g.label.x0}
          y={f1(top + 0.43 * T)}
          dominantBaseline="central"
          fill={C.ink}
          style={{ fontFamily: FONT, fontSize: `${label.px}px`, fontWeight: 600 }}
        >
          {label.text}
        </text>
      )}
    </svg>
  );
}

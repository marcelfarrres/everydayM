import type { CSSProperties } from 'react';
import { PAD_COLORS as C, type PadRocketGeometry } from '@/components/workout/padRocketShape';

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
const f1 = (v: number) => Math.round(v * 10) / 10;

/** A column of rivets from y0 to y1 at x, as one path of small circles. */
function rivetPath(x: number, y0: number, y1: number, r: number, gap: number): string {
  let d = '';
  for (let y = y0; y <= y1 + 0.01; y += gap) d += `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0`;
  return d;
}

/** The checker strip: two columns of cells, alternating, clipped to the hull. */
function checkerPath(x: number, w: number, cell: number, y0: number, y1: number): string {
  let d = '';
  let row = 0;
  for (let y = y0; y < y1 - 0.2; y += cell, row += 1) {
    const h = Math.min(cell, y1 - y);
    const cx = x + (row % 2) * (w / 2);
    d += `M${f1(cx)} ${f1(y)}h${f1(w / 2)}v${f1(h)}h${f1(-w / 2)}z`;
  }
  return d;
}

export function PadRocket({ g, label, flame = 0, hatchOpen = false, parts = {}, className = '', style }: PadRocketProps) {
  const { T, Tf, cy, stroke: sw } = g;
  const { x0, x1, top, bottom } = g.body;
  const show = { flame: true, fins: true, hatch: true, window: true, antenna: true, ...parts };
  // the nose: x along Tf, y along the body's own thickness
  const X = (k: number) => f1(x1 + k * Tf);
  const Y = (k: number) => f1(cy + k * T);
  const noseOutline = `M${x1} ${top}C${X(0.571)} ${Y(-0.464)} ${X(1.036)} ${Y(-0.268)} ${X(1.232)} ${Y(-0.107)}Q${X(1.357)} ${cy} ${X(1.232)} ${Y(0.107)}C${X(1.036)} ${Y(0.268)} ${X(0.571)} ${Y(0.464)} ${x1} ${bottom}Z`;
  const noseBelly = `M${x1} ${Y(0.286)}L${X(0.893)} ${Y(0.286)}C${X(0.607)} ${Y(0.393)} ${X(0.286)} ${Y(0.482)} ${x1} ${bottom}Z`;
  const noseTip = `M${X(0.929)} ${Y(-0.259)}C${X(1.071)} ${Y(-0.205)} ${X(1.161)} ${Y(-0.161)} ${X(1.232)} ${Y(-0.107)}Q${X(1.357)} ${cy} ${X(1.232)} ${Y(0.107)}C${X(1.161)} ${Y(0.161)} ${X(1.071)} ${Y(0.205)} ${X(0.929)} ${Y(0.259)}C${X(1)} ${Y(0.089)} ${X(1)} ${Y(-0.089)} ${X(0.929)} ${Y(-0.259)}Z`;

  // the bell nozzle, from the hull back to its mouth (x = 0)
  const N = x0;
  const nozzle = `M${x0} ${f1(cy - 0.32 * Tf)}L0 ${f1(cy - 0.464 * Tf)}Q${f1(-0.125 * Tf)} ${cy} 0 ${f1(cy + 0.464 * Tf)}L${x0} ${f1(cy + 0.32 * Tf)}Z`;
  const ribs = `M${f1(0.27 * N)} ${f1(cy - 0.41 * Tf)}Q${f1(0.05 * N)} ${cy} ${f1(0.27 * N)} ${f1(cy + 0.41 * Tf)}M${f1(0.64 * N)} ${f1(cy - 0.36 * Tf)}Q${f1(0.45 * N)} ${cy} ${f1(0.64 * N)} ${f1(cy + 0.36 * Tf)}`;

  // swept fins at the tail, a rib line on the top one
  const { x0: fx, len: fl, h: fh } = g.fin;
  const finTop = `M${fx} ${top}L${f1(fx + 0.162 * fl)} ${f1(top - fh)}L${f1(fx + 0.65 * fl)} ${f1(top - fh)}L${f1(fx + fl)} ${top}Z`;
  const finBottom = `M${fx} ${bottom}L${f1(fx + 0.162 * fl)} ${f1(bottom + fh)}L${f1(fx + 0.65 * fl)} ${f1(bottom + fh)}L${f1(fx + fl)} ${bottom}Z`;
  const finRibs = `M${f1(fx + 0.297 * fl)} ${f1(top - 0.833 * fh)}L${f1(fx + 0.514 * fl)} ${top}M${f1(fx + 0.486 * fl)} ${f1(top - 0.917 * fh)}L${f1(fx + 0.757 * fl)} ${top}`;

  // the flame, from the nozzle's mouth out to the left: red, pink, white
  const flamePath = (half: number, reach: number, back: number) =>
    `M0 ${f1(cy - half * Tf)}Q${f1(-reach * Tf)} ${cy} 0 ${f1(cy + half * Tf)}Q${f1(-back * Tf)} ${cy} 0 ${f1(cy - half * Tf)}Z`;
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
            <path d={flamePath(0.386, 2, 0.59)} fill={C.red} />
            <path d={flamePath(0.27, 1.36, 0.45)} fill={C.flameMid} />
            <path d={flamePath(0.16, 0.77, 0.23)} fill={C.hull} />
          </g>
        </g>
      )}
      <g stroke={C.ink} strokeLinejoin="round">
        <g data-part="nozzle">
          <path d={nozzle} fill={C.ink} strokeWidth={sw * 0.8} />
          <path d={ribs} stroke={C.rib} strokeWidth={1} fill="none" />
        </g>
        {show.fins && (
          <g data-part="fins">
            <g data-part="fin-top">
              <path d={finTop} fill={C.hull} strokeWidth={sw} />
              <path d={finRibs} strokeWidth={1} fill="none" />
            </g>
            <g data-part="fin-bottom">
              <path d={finBottom} fill={C.shade} strokeWidth={sw} />
            </g>
          </g>
        )}
        <g data-part="hull">
          <rect x={x0} y={top} width={f1(x1 - x0 + 1)} height={T} rx={f1(Math.min(5, 0.09 * Tf))} fill={C.hull} strokeWidth={sw} />
          <rect x={x0 + sw / 2} y={g.belly.light} width={f1(x1 - x0)} height={f1(g.belly.dark - g.belly.light)} fill={C.shade} stroke="none" />
          <rect x={x0 + sw / 2} y={g.belly.dark} width={f1(x1 - x0)} height={f1(inner.bottom - g.belly.dark)} fill={C.shadeDark} stroke="none" />
          <path d={`M${f1(g.label.x0)} ${f1(top + 0.12 * Tf)}H${f1(g.seam.x - 0.1 * Tf)}`} stroke={C.shadeDark} strokeWidth={1} fill="none" />
        </g>
        <g data-part="tail">
          <rect x={g.ring.x} y={top} width={g.ring.w} height={T} rx={2} fill={C.shade} strokeWidth={sw * 0.75} />
          <rect x={g.band.x} y={inner.top} width={g.band.w} height={f1(inner.bottom - inner.top)} fill={C.red} stroke="none" />
          <path d={checkerPath(g.checker.x, g.checker.w, g.checker.cell, inner.top, inner.bottom)} fill={C.ink} stroke="none" />
        </g>
        <g data-part="rivets">
          <path d={`M${g.seam.x} ${inner.top}V${inner.bottom}`} strokeWidth={1} fill="none" />
          <path d={rivetPath(g.seam.x + 0.04 * Tf + g.seam.rivetW / 2, inner.top + 0.12 * Tf, inner.bottom - 0.12 * Tf, rivetR, rivetGap)} fill={C.ink} stroke="none" />
        </g>
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
        <g data-part="nose">
          <path d={noseOutline} fill={C.hull} stroke="none" />
          <path d={noseBelly} fill={C.shade} stroke="none" />
          <path d={noseTip} fill={C.ink} stroke="none" />
          <path d={noseOutline} fill="none" strokeWidth={sw} />
        </g>
        {show.window && (
          <g data-part="window">
            <circle cx={w.cx} cy={w.cy} r={w.r} fill={C.hull} strokeWidth={sw * 0.9} />
            <circle cx={w.cx} cy={w.cy} r={f1(w.r * 0.625)} fill={C.glass} strokeWidth={Math.max(0.9, sw * 0.55)} />
            <path
              d={`M${f1(w.cx - 0.375 * w.r)} ${f1(w.cy - 0.19 * w.r)}Q${f1(w.cx - 0.19 * w.r)} ${f1(w.cy - 0.44 * w.r)} ${f1(w.cx + 0.19 * w.r)} ${f1(w.cy - 0.44 * w.r)}`}
              stroke={C.hull}
              strokeWidth={Math.max(1, sw * 0.7)}
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}
        {show.antenna && (
          <g data-part="antenna">
            <path d={`M${f1(g.antenna.x0 + 0.01 * Tf)} ${cy}H${g.antenna.x1}`} strokeWidth={sw * 0.75} />
            <circle cx={f1(g.antenna.x1 + g.antenna.light)} cy={cy} r={f1(Math.max(1.6, g.antenna.light))} fill={C.red} stroke="none" />
          </g>
        )}
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

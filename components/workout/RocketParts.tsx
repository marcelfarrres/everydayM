import type { CSSProperties } from 'react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { FLAME_LAYERS, checkerPath, f1, finPaths, flameLayer, nosePaths, nozzlePaths, rivetPath, windowGlint } from '@/components/workout/rocketPaths';

/*
 * The rocket's parts, painted: one drawing language for every rocket of the app (the first
 * screen's PadRocket and the routine's RocketShip share these). Each goes inside an <svg> whose
 * group sets `stroke` to ink and round joins; every fill and width is set here. Flat fills, no
 * gradients, no ids or patterns (the creator flies clones of its rockets' DOM).
 *
 * `tag` puts the part's name in `data-part` (PadRocket's scheme, so a screen can hide or animate a
 * part). RocketShip leaves it off: its own `data-part` layers are its stretch's (RocketWidget).
 */

const tagged = (tag: boolean, name: string) => (tag ? name : undefined);

export function NozzlePart({ x0, xm, cy, Tf, sw, ribs = true, tag = true }: { x0: number; xm: number; cy: number; Tf: number; sw: number; ribs?: boolean; tag?: boolean }) {
  const p = nozzlePaths(x0, xm, cy, Tf);
  return (
    <g data-part={tagged(tag, 'nozzle')}>
      <path d={p.bell} fill={C.ink} strokeWidth={sw * 0.8} />
      {ribs && <path d={p.ribs} stroke={C.rib} strokeWidth={1} fill="none" />}
    </g>
  );
}

/**
 * The fins, top and bottom. `topStyle`/`bottomStyle`: their own transforms (the player's fins
 * spring out of the hull: RocketShip scales each one from its base).
 */
export function FinsPart({
  fin,
  top,
  bottom,
  sw,
  ribs = true,
  tag = true,
  topStyle,
  bottomStyle,
}: {
  fin: { x0: number; len: number; h: number };
  top: number;
  bottom: number;
  sw: number;
  ribs?: boolean;
  tag?: boolean;
  topStyle?: CSSProperties;
  bottomStyle?: CSSProperties;
}) {
  const p = finPaths(fin.x0, fin.len, fin.h, top, bottom);
  return (
    <g data-part={tagged(tag, 'fins')}>
      <g data-part={tagged(tag, 'fin-top')} data-fin={tag ? undefined : 'top'} style={topStyle}>
        <path d={p.top} fill={C.hull} strokeWidth={sw} />
        {ribs && <path d={p.ribs} strokeWidth={1} fill="none" />}
      </g>
      <g data-part={tagged(tag, 'fin-bottom')} data-fin={tag ? undefined : 'bottom'} style={bottomStyle}>
        <path d={p.bottom} fill={C.shade} strokeWidth={sw} />
      </g>
    </g>
  );
}

/** The engine ring, the red band and the checker strip at the tail. */
export function TailPart({
  ring,
  band,
  checker,
  top,
  T,
  inner,
  sw,
  tag = true,
}: {
  ring: { x: number; w: number };
  band: { x: number; w: number };
  checker: { x: number; w: number; cell: number };
  top: number;
  T: number;
  inner: { top: number; bottom: number };
  sw: number;
  tag?: boolean;
}) {
  return (
    <g data-part={tagged(tag, 'tail')}>
      <rect x={ring.x} y={top} width={ring.w} height={T} rx={2} fill={C.shade} strokeWidth={sw * 0.75} />
      <rect x={band.x} y={inner.top} width={band.w} height={f1(inner.bottom - inner.top)} fill={C.red} stroke="none" />
      <path d={checkerPath(checker.x, checker.w, checker.cell, inner.top, inner.bottom)} fill={C.ink} stroke="none" />
    </g>
  );
}

/** A seam line and its column of rivets. */
export function RivetsPart({
  seamX,
  rivetX,
  inner,
  r,
  gap,
  inset,
  tag = true,
}: {
  seamX: number | null;
  rivetX: number;
  inner: { top: number; bottom: number };
  r: number;
  gap: number;
  /** from the hull's lines to the first and last rivet */
  inset: number;
  tag?: boolean;
}) {
  return (
    <g data-part={tagged(tag, 'rivets')}>
      {seamX !== null && <path d={`M${seamX} ${inner.top}V${inner.bottom}`} strokeWidth={1} fill="none" />}
      <path d={rivetPath(rivetX, inner.top + inset, inner.bottom - inset, r, gap)} fill={C.ink} stroke="none" />
    </g>
  );
}

/** The nose: white, its belly shaded, its rounded end in ink, and its outline. */
export function NosePart({ x1, top, bottom, cy, T, Tf, sw, tag = true }: { x1: number; top: number; bottom: number; cy: number; T: number; Tf: number; sw: number; tag?: boolean }) {
  const p = nosePaths(x1, top, bottom, cy, T, Tf);
  return (
    <g data-part={tagged(tag, 'nose')}>
      <path d={p.outline} fill={C.hull} stroke="none" />
      <path d={p.belly} fill={C.shade} stroke="none" />
      <path d={p.tip} fill={C.ink} stroke="none" />
      <path d={p.outline} fill="none" strokeWidth={sw} />
    </g>
  );
}

/** The window: a white ring, the pale blue glass, and its reflection (left off when it is tiny). */
export function WindowPart({ w, sw, glint = true, tag = true }: { w: { cx: number; cy: number; r: number }; sw: number; glint?: boolean; tag?: boolean }) {
  return (
    <g data-part={tagged(tag, 'window')}>
      <circle cx={w.cx} cy={w.cy} r={w.r} fill={C.hull} strokeWidth={sw * 0.9} />
      <circle cx={w.cx} cy={w.cy} r={f1(w.r * 0.625)} fill={C.glass} strokeWidth={Math.max(0.9, sw * 0.55)} />
      {glint && <path d={windowGlint(w)} stroke={C.hull} strokeWidth={Math.max(1, sw * 0.7)} fill="none" strokeLinecap="round" />}
    </g>
  );
}

/** The antenna on the nose's end and its red light. */
export function AntennaPart({ x0, x1, light, cy, Tf, sw, tag = true }: { x0: number; x1: number; light: number; cy: number; Tf: number; sw: number; tag?: boolean }) {
  return (
    <g data-part={tagged(tag, 'antenna')}>
      <path d={`M${f1(x0 + 0.01 * Tf)} ${cy}H${x1}`} strokeWidth={sw * 0.75} />
      <circle cx={f1(x1 + light)} cy={cy} r={f1(Math.max(1.6, light))} fill={C.red} stroke="none" />
    </g>
  );
}

/**
 * The flame's three layers from its root at `x` out to the left (red, pink, white): `along` px per
 * unit (its tip is one unit out), `across` px per unit of its thickness. `color`/`mid`: another
 * flame's (the blue warning before a takeoff).
 */
export function FlameLayers({ x, cy, along, across, color = C.red, mid = C.flameMid }: { x: number; cy: number; along: number; across: number; color?: string; mid?: string }) {
  return (
    <>
      {FLAME_LAYERS.map((l, i) => (
        <path key={i} d={flameLayer(x, cy, l.half * across, l.reach * along, l.back * along)} fill={i === 0 ? color : i === 1 ? mid : C.hull} />
      ))}
    </>
  );
}

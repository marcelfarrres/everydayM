import type { CSSProperties, ReactNode } from 'react';
import { Hilo } from '@/components/workout/player/Hilo';
import type { StepState } from '@/components/workout/player/model';
import { SHIP, flamePaths, type Box, type ShipGeometry } from '@/components/workout/rocketShape';

/*
 * The rocket of the phone, as a drawing that can be reused: white with the ink line, the flame in
 * red (the only colour), and in its body, optionally, the hilo. It lies on its side with the nose
 * to the right; RocketFigure stands it on its tail and scales it (the big rocket of the clouds is
 * this same drawing, bigger). The geometry, in pixels at scale 1, is rocketShape's.
 *
 * Layers, back to front: `behind` (flames, puffs), fins + nozzle + hull, `inside` (water, clipped
 * by the caller to `g.inside`), the bands and the edge-on fin, the hilo.
 */

const INK = '#131313';
const RED = '#ff3b30';

export const FLAME = flamePaths();

export const boxStyle = (b: Box): CSSProperties => ({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top });

/** The flame, pointing left from the nozzle, flickering from its root (red; blue for the warning before it lights). */
export function FlameDrawing({ color = RED }: { color?: string }) {
  return (
    <svg viewBox={`0 0 ${FLAME.w} ${FLAME.h}`} className="rw-flicker block h-full w-full overflow-visible">
      <path d={FLAME.outer} fill={color} />
      <path d={FLAME.core} fill="#fff" />
    </svg>
  );
}

/** Where the flame goes, behind the nozzle (it scales from its root). */
export const flameBox = (g: ShipGeometry): CSSProperties => ({
  left: g.xe + 3 - FLAME.w,
  top: g.cy - FLAME.h / 2,
  width: FLAME.w,
  height: FLAME.h,
  transformOrigin: '100% 50%',
});

export function RocketShip({
  g,
  hilo,
  behind,
  inside,
  className = '',
  style,
}: {
  g: ShipGeometry;
  /** the hilo in the body: one list of serie states per block */
  hilo?: StepState[][];
  behind?: ReactNode;
  inside?: ReactNode;
  /** its position classes (relative by default) */
  className?: string;
  style?: CSSProperties;
}) {
  const { F, T } = g;
  const { STROKE } = SHIP;
  const svg = {
    'aria-hidden': true,
    width: g.W,
    height: g.H,
    viewBox: `0 0 ${g.W} ${g.H}`,
    className: 'pointer-events-none absolute left-0 top-0 overflow-visible',
    fill: '#fff',
    stroke: INK,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  } as const;
  return (
    <div data-rocket="" className={className || 'relative'} style={{ width: g.W, height: g.H, ...style }}>
      {behind}
      <svg {...svg} strokeWidth={STROKE}>
        <path d={g.finTop} />
        <path d={g.finBottom} />
        <path d={g.nozzle} />
        <path d={g.nozzleLine} strokeWidth={1.1} />
        <path d={g.hull} />
      </svg>
      {inside}
      <svg {...svg}>
        {g.bands.map((x, i) => (
          <path key={x} d={`M${x} ${F} L${x} ${F + T}`} strokeWidth={i === 2 ? STROKE : 1.25} />
        ))}
        <path d={g.edgeFin} strokeWidth={1.5} />
      </svg>
      {hilo && (
        <div data-rocket="hilo" className="pointer-events-none absolute flex items-center" style={boxStyle(g.content)}>
          <Hilo surface="light" size="lg" className="flex-1" blocks={hilo} />
        </div>
      )}
    </div>
  );
}

/**
 * The rocket as a figure in the page: `scale` times its size, lying (nose right) or `upright`
 * (nose up, standing on its tail). The figure's box is the scaled rocket's.
 */
export function RocketFigure({
  g,
  scale = 1,
  upright = false,
  flame = 0,
  hilo,
  className = '',
  style,
}: {
  g: ShipGeometry;
  scale?: number;
  upright?: boolean;
  /** the engine burning: 1 in flight, a little (0.2–0.4) while it waits to go; 0 off */
  flame?: number;
  hilo?: StepState[][];
  /** its position classes (relative by default) */
  className?: string;
  style?: CSSProperties;
}) {
  const k = scale;
  const transform = upright ? `scale(${k}) translateY(${g.W}px) rotate(-90deg)` : `scale(${k})`;
  return (
    <div
      aria-hidden="true"
      className={className || 'relative'}
      style={{ width: (upright ? g.H : g.W) * k, height: (upright ? g.W : g.H) * k, ...style }}
    >
      <RocketShip
        g={g}
        hilo={hilo}
        className="absolute left-0 top-0"
        style={{ transform, transformOrigin: '0 0' }}
        behind={
          flame > 0 ? (
            <div data-rocket-flame="" className="absolute" style={{ ...flameBox(g), transform: `scale(${flame}, ${0.5 + flame / 2})` }}>
              <FlameDrawing />
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

/** A box of the lying rocket's drawing (its hilo's room, say) in the pixels of a figure `k` times its size. */
export const scaledBox = (b: Box, k: number): CSSProperties => ({ left: b.left * k, top: b.top * k, width: (b.right - b.left) * k, height: (b.bottom - b.top) * k });

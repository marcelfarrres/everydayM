import type { CSSProperties, ReactNode } from 'react';
import { Hilo } from '@/components/workout/player/Hilo';
import type { StepState } from '@/components/workout/player/model';
import { SHIP, flamePaths, type Box, type ShipGeometry } from '@/components/workout/rocketShape';

/*
 * The rocket of the phone, as a drawing that can be reused: white with the ink line, the flame in
 * red (the only colour), and in its segments, optionally, the lines of their series (the hilo). It lies on its side with the nose
 * to the right; RocketFigure stands it on its tail and scales it (the big rocket of the clouds is
 * this same drawing, bigger). The geometry, in pixels at scale 1, is rocketShape's.
 *
 * It is drawn as pieces (each segment with its motor, the nose, the boosters), each in two layers
 * so the water of a rest can go between them: back to front, `behind` (flames, puffs), every
 * piece's outline (white), `inside` (water, clipped by the caller to `g.inside`), every piece's
 * details (joints, rivets, the window) and each segment's lines of its series. Every layer carries
 * `data-piece`, so a piece can be moved on its own (put together, or coming off).
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

/** A piece of the rocket: a segment (`seg-<block>`), the nose, or the boosters. */
export type Piece = `seg-${number}` | 'nose' | 'boosters';

/** The pieces of a geometry, tail first, then the nose, then the boosters (the order they are put together). */
export const piecesOf = (g: ShipGeometry): Piece[] => [...g.segments.map((s) => `seg-${s.block}` as Piece), 'nose', ...(g.boosters ? (['boosters'] as Piece[]) : [])];

export function RocketShip({
  g,
  hilo,
  behind,
  inside,
  only,
  className = '',
  style,
}: {
  g: ShipGeometry;
  /** the series of each block, in its segment: one list of serie states per block (block 1 first) */
  hilo?: StepState[][];
  behind?: ReactNode;
  inside?: ReactNode;
  /** draw only these pieces (a segment coming off, say) */
  only?: Piece[];
  /** its position classes (relative by default) */
  className?: string;
  style?: CSSProperties;
}) {
  const { F, T, cy } = g;
  const { STROKE } = SHIP;
  const shows = (p: Piece) => !only || only.includes(p);
  // `part`: what a segment's layer is to the bar's stretch (RocketWidget): its body scales along
  // the rocket (from the frame's left edge), what sits at either end of it moves with that end
  const svg = (piece: Piece, layer: string, children: ReactNode, strokeWidth: number = STROKE, part?: 'body' | 'start' | 'end') => (
    <svg
      key={`${piece}-${layer}`}
      data-piece={piece}
      data-part={part}
      aria-hidden="true"
      width={g.W}
      height={g.H}
      viewBox={`0 0 ${g.W} ${g.H}`}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      style={part === 'body' ? { transformOrigin: '0 0' } : undefined}
      fill="#fff"
      stroke={INK}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {children}
    </svg>
  );
  const tail = g.segments[0];
  const back: ReactNode[] = [];
  const front: ReactNode[] = [];

  if (g.boosters && shows('boosters')) {
    back.push(
      svg('boosters', 'back', [
        <path key="n" d={g.boosters.nozzles} />,
        <path key="t" d={g.boosters.top} />,
        <path key="b" d={g.boosters.bottom} />,
      ]),
    );
    front.push(svg('boosters', 'front', <path d={g.boosters.seams} strokeWidth={1} strokeOpacity={0.55} />));
  }
  for (const seg of g.segments) {
    const piece: Piece = `seg-${seg.block}`;
    if (!shows(piece)) continue;
    // its motor: only the tail's can be seen
    if (seg === tail) back.push(svg(piece, 'nozzle', <path d={g.nozzle} />, STROKE, 'start'));
    // its body: the white and its two long lines (its ends are drawn with them, below), so it can
    // be stretched without any line getting thicker
    back.push(
      svg(
        piece,
        'back',
        [
          <rect key="fill" x={seg.start} y={F} width={r1(seg.end - seg.start)} height={T} stroke="none" />,
          <path key="lines" d={`M${seg.start} ${F} L${seg.end} ${F} M${seg.start} ${F + T} L${seg.end} ${F + T}`} fill="none" strokeLinecap="butt" />,
        ],
        STROKE,
        'body',
      ),
    );
    const joint = g.joints.find((j) => j.back === seg.block);
    // a rivet at each end, top and bottom
    const rivets = (x: number) => [
      <circle key={`r${x}t`} cx={r1(x)} cy={F + 2.8} r={0.75} fill={INK} stroke="none" opacity={0.55} />,
      <circle key={`r${x}b`} cx={r1(x)} cy={F + T - 2.8} r={0.75} fill={INK} stroke="none" opacity={0.55} />,
    ];
    const edge = (x: number) => <path key={`e${x}`} d={`M${x} ${F} L${x} ${F + T}`} fill="none" />;
    // (its left end is the joint of the one behind it, unless it is the tail)
    front.push(svg(piece, 'start', [seg === tail && edge(seg.start), ...rivets(seg.start + 5)], STROKE, 'start'));
    const details: ReactNode[] = [
      edge(seg.end),
      // a scratch of wear near its top edge
      <path key="scratch" d={`M${r1(seg.end - 16)} ${F + 2.6} L${r1(seg.end - 11)} ${F + 4}`} strokeWidth={0.8} strokeOpacity={0.4} />,
      ...rivets(seg.end - 5),
    ];
    if (joint) {
      const x = joint.x;
      const half = SHIP.JOINT / 2;
      const squares = Math.floor((T - STROKE) / 4);
      details.push(
        <path key="jl" d={`M${r1(x - half + 1)} ${F} L${r1(x - half + 1)} ${F + T} M${r1(x + half - 1)} ${F} L${r1(x + half - 1)} ${F + T}`} strokeWidth={1} />,
        ...Array.from({ length: squares }, (_, i) =>
          i % 2 === 0 ? <rect key={`c${i}`} x={r1(x - 2)} y={r1(F + STROKE / 2 + i * 4)} width={2} height={4} fill={INK} stroke="none" /> : (
            <rect key={`c${i}`} x={r1(x)} y={r1(F + STROKE / 2 + i * 4)} width={2} height={4} fill={INK} stroke="none" />
          ),
        ),
      );
    }
    front.push(svg(piece, 'front', details, STROKE, 'end'));
    const lines = hilo?.[seg.block - 1];
    if (lines) {
      front.push(
        <div
          key={`${piece}-hilo`}
          data-piece={piece}
          data-part="body"
          data-rocket="hilo"
          className="pointer-events-none absolute flex items-center"
          style={{ ...boxStyle(seg.content), transformOrigin: '0 0' }}
        >
          <Hilo surface="light" size="lg" className="flex-1" blocks={[lines]} />
        </div>,
      );
    }
  }
  if (shows('nose')) {
    back.push(
      svg('nose', 'back', [
        <path key="probe" d={g.probe} strokeWidth={1.4} />,
        <circle key="ball" cx={r1(g.tip - 1.2)} cy={cy} r={1.2} fill={INK} stroke="none" />,
        <path key="cap" d={g.cap} />,
      ]),
    );
    front.push(svg('nose', 'front', <circle cx={g.window.cx} cy={g.window.cy} r={g.window.r} strokeWidth={1.3} />));
  }

  return (
    <div data-rocket="" className={className || 'relative'} style={{ width: g.W, height: g.H, ...style }}>
      {behind}
      {back}
      {inside}
      {front}
    </div>
  );
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The rocket as a figure in the page: `scale` times its size, lying (nose right) or `upright`
 * (nose up, standing on its tail). The figure's box is the scaled rocket's.
 */
export function RocketFigure({
  g,
  scale = 1,
  upright = false,
  flame = 0,
  hoverFlame = false,
  hilo,
  className = '',
  style,
}: {
  g: ShipGeometry;
  scale?: number;
  upright?: boolean;
  /** the engine burning: 1 in flight, a little (0.2–0.4) while it waits to go; 0 off */
  flame?: number;
  /** a button's rocket with its engine off: a small flame, hidden, that lights when the button is hovered (.rw-lift) */
  hoverFlame?: boolean;
  hilo?: StepState[][];
  /** its position classes (relative by default) */
  className?: string;
  style?: CSSProperties;
}) {
  const k = scale;
  const transform = upright ? `scale(${k}) translateY(${g.W}px) rotate(-90deg)` : `scale(${k})`;
  const unlit = flame <= 0 && hoverFlame;
  const f = unlit ? 0.3 : flame;
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
          f > 0 ? (
            <div
              data-rocket-flame=""
              data-unlit={unlit ? '' : undefined}
              className="absolute"
              style={{ ...flameBox(g), transform: `scale(${f}, ${0.5 + f / 2})` }}
            >
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

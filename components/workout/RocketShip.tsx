'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { Hilo } from '@/components/workout/player/Hilo';
import type { StepState } from '@/components/workout/player/model';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { AntennaPart, FinsPart, FlameLayers, NosePart, NozzlePart, TailPart, WindowPart } from '@/components/workout/RocketParts';
import { FLAME_LAYERS, f1, rivetPath } from '@/components/workout/rocketPaths';
import { SHIP, flameBoxSize, stageLabels, stageLayout, type Box, type ShipGeometry } from '@/components/workout/rocketShape';
import { useTextMeasure } from '@/components/workout/textMeasure';

/*
 * The routine's rocket (and, as one stage, every other rocket of the player and the creator), as a
 * drawing that can be reused: the approved design (cohete-reproductor), in the parts the first
 * screen's rocket is drawn with (RocketParts.tsx). Lying on its side with the nose to the right;
 * RocketFigure stands it on its tail and scales it (the big rocket of the clouds is this same
 * drawing, bigger). The geometry, in pixels at scale 1, is rocketShape's.
 *
 * It is drawn as pieces (each stage, the nose, the boosters), each in layers: back to front,
 * `behind` (flames, puffs), the boosters, each stage's nozzle and fins (the tail's), each stage's
 * body (white, belly, its long lines), the nose, then each stage's livery or rivets, its ring, its
 * name and the bars of its series, and the window. Every layer carries `data-piece`, so a piece can
 * be moved on its own (put together, or coming off), and a stage's layers `data-part` (what it is
 * to the bar's stretch: `body` scales along the rocket, `start`/`end` move with that end, `mid`
 * moves with the stage's middle; RocketWidget). The fins carry `data-fin` (they spring out).
 */

const RED = C.red;
const FONT = 'var(--font-display), var(--font-geist-sans), system-ui, sans-serif';

export const FLAME = flameBoxSize();

export const boxStyle = (b: Box): CSSProperties => ({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top });

/** The flame, pointing left from the nozzle, flickering from its root (red; blue for the warning before it lights). */
export function FlameDrawing({ color = RED }: { color?: string }) {
  return (
    <svg viewBox={`0 0 ${FLAME.w} ${FLAME.h}`} className="rw-flicker block h-full w-full overflow-visible">
      <FlameLayers x={FLAME.w} cy={FLAME.h / 2} along={FLAME.w} across={FLAME.h / (2 * FLAME_LAYERS[0].half)} color={color} mid={color === RED ? C.flameMid : C.glass} />
    </svg>
  );
}

/** Where the flame goes, behind the nozzle (it scales from its root). */
export const flameBox = (g: ShipGeometry): CSSProperties => ({
  left: g.xe + 2 - FLAME.w,
  top: g.cy - FLAME.h / 2,
  width: FLAME.w,
  height: FLAME.h,
  transformOrigin: '100% 50%',
});

/** A piece of the rocket: a stage (`seg-<block>`), the nose, or the boosters. */
export type Piece = `seg-${number}` | 'nose' | 'boosters';

/** The pieces of a geometry, tail first, then the nose, then the boosters (the order they are put together). */
export const piecesOf = (g: ShipGeometry): Piece[] => [...g.segments.map((s) => `seg-${s.block}` as Piece), 'nose', ...(g.boosters ? (['boosters'] as Piece[]) : [])];

/** The fins hidden in the hull (they spring out from here: RocketWidget). */
export const FINS_IN = 'scale(1, 0)';

export function RocketShip({
  g,
  hilo,
  names,
  finsOut = true,
  behind,
  only,
  className = '',
  style,
}: {
  g: ShipGeometry;
  /** the series of each block, in its stage: one list of serie states per block (block 1 first) */
  hilo?: StepState[][];
  /** each stage's block name ("Bloque 2"), as big as fits (with a hilo, by default) */
  names?: boolean;
  /** false: the tail's fins are still inside the hull (until they spring out) */
  finsOut?: boolean;
  behind?: ReactNode;
  /** draw only these pieces (a stage coming off, say) */
  only?: Piece[];
  /** its position classes (relative by default) */
  className?: string;
  style?: CSSProperties;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measure = useTextMeasure(root);
  const { F, T, cy, stroke: sw } = g;
  const shows = (p: Piece) => !only || only.includes(p);
  const withNames = names ?? !!hilo;
  const labels = useMemo(() => (withNames ? stageLabels(g, measure) : []), [withNames, g, measure]);
  const layout = stageLayout(g);
  const inner = { top: F + sw / 2, bottom: F + T - sw / 2 };
  const rivet = (x: number) => <path key={`rv${x}`} d={rivetPath(f1(x), inner.top + 1.9, inner.bottom - 1.9, 0.8, inner.bottom - inner.top - 3.8)} fill={C.ink} stroke="none" opacity={0.7} />;
  // `part`: what a stage's layer is to the bar's stretch (RocketWidget): its body scales along the
  // rocket (from the frame's left edge), what sits at either end of it moves with that end, its
  // name moves with its middle (about which it may shrink)
  const svg = (piece: Piece, layer: string, children: ReactNode, part?: 'body' | 'start' | 'end' | 'mid', origin?: string) => (
    <svg
      key={`${piece}-${layer}`}
      data-piece={piece}
      data-part={part}
      aria-hidden="true"
      width={g.W}
      height={g.H}
      viewBox={`0 0 ${g.W} ${g.H}`}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      style={part === 'body' ? { transformOrigin: '0 0' } : origin ? { transformOrigin: origin } : undefined}
      fill={C.hull}
      stroke={C.ink}
      strokeWidth={sw}
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
  const tail = g.segments[0];
  const back: ReactNode[] = [];
  const mid: ReactNode[] = [];
  const front: ReactNode[] = [];

  if (g.boosters && shows('boosters')) {
    const b = g.boosters.shape;
    const one = (side: typeof b.upper, fill: string, gapY: number, k: string) => [
      <path key={`${k}n`} d={side.nozzle} fill={C.ink} strokeWidth={sw * 0.7} />,
      ...b.brackets.map((br, i) => <rect key={`${k}k${i}`} x={br.x} y={gapY - 0.3} width={br.w} height={f1(b.gapTop.h + 0.6)} fill={C.ink} stroke="none" />),
      <path key={`${k}b`} d={side.body} fill={fill} strokeWidth={sw * 0.8} />,
      <rect key={`${k}r`} x={b.band.x} y={f1(side.y + 0.6)} width={b.band.w} height={f1(b.h - 1.2)} fill={C.red} stroke="none" />,
    ];
    back.push(svg('boosters', 'back', [...one(b.upper, C.hull, b.gapTop.y, 'u'), ...one(b.lower, C.shade, b.gapBottom.y, 'l')]));
  }
  for (const seg of g.segments) {
    const piece: Piece = `seg-${seg.block}`;
    if (!shows(piece)) continue;
    const isTail = seg === tail;
    // its motor and its fins: only the tail's can be seen (behind the hull, so its line runs on)
    if (isTail) {
      back.push(
        svg(
          piece,
          'motor',
          [
            <NozzlePart key="n" x0={g.x0} xm={g.xe} cy={cy} Tf={T} sw={sw} tag={false} />,
            g.fins && (
              <FinsPart
                key="f"
                fin={g.fins}
                top={F}
                bottom={F + T}
                sw={sw}
                tag={false}
                topStyle={{ transformOrigin: `0px ${F}px`, transform: finsOut ? undefined : FINS_IN }}
                bottomStyle={{ transformOrigin: `0px ${F + T}px`, transform: finsOut ? undefined : FINS_IN }}
              />
            ),
          ],
          'start',
        ),
      );
    }
    // its body: the white, the belly's two tones and its two long lines (its ends are drawn with
    // them, below), so it can be stretched without any line getting thicker
    const len = f1(seg.end - seg.start);
    back.push(
      svg(
        piece,
        'body',
        [
          <rect key="fill" x={seg.start} y={F} width={len} height={T} stroke="none" />,
          <rect key="bl" x={seg.start} y={g.belly.light} width={len} height={f1(g.belly.dark - g.belly.light)} fill={C.shade} stroke="none" />,
          <rect key="bd" x={seg.start} y={g.belly.dark} width={len} height={f1(inner.bottom - g.belly.dark)} fill={C.shadeDark} stroke="none" />,
          <path key="lines" d={`M${seg.start} ${F}H${seg.end}M${seg.start} ${F + T}H${seg.end}`} fill="none" />,
        ],
        'body',
      ),
    );
    // its tail end: the livery (the tail) or a pair of rivets by the ring behind it
    front.push(
      svg(
        piece,
        'start',
        isTail ? <TailPart ring={g.livery.ring} band={g.livery.band} checker={g.livery.checker} top={F} T={T} inner={inner} sw={sw} tag={false} /> : rivet(seg.start + SHIP.JOINT / 2 + 1.3),
        'start',
      ),
    );
    // its front end: the ring to the next stage (black, white dashes), or by the nose its rivets
    const joint = g.joints.find((j) => j.back === seg.block);
    const ends: ReactNode[] = [];
    if (joint) {
      const half = SHIP.JOINT / 2;
      const dashes: ReactNode[] = [];
      for (let y = F + 2.6, i = 0; y + 1.4 <= F + T - 2.4; y += 3.6, i++) {
        dashes.push(<rect key={`d${i}`} x={f1(joint.x - 0.6)} y={f1(y)} width={1.2} height={1.4} fill={C.hull} stroke="none" />);
      }
      ends.push(<rect key="ring" x={f1(joint.x - half)} y={f1(F - sw / 2)} width={SHIP.JOINT} height={f1(T + sw)} fill={C.ink} stroke="none" />, ...dashes, rivet(joint.x - half - 1.3));
    } else ends.push(rivet(seg.end - 2.6));
    front.push(svg(piece, 'end', ends, 'end'));
    // its name, as big as fits (it moves with the stage's middle and is never stretched)
    const label = labels.find((l) => l.block === seg.block);
    if (label) {
      mid.push(
        svg(
          piece,
          'name',
          <text x={label.x} y={label.y} textAnchor="middle" fill={C.ink} stroke="none" style={{ fontFamily: FONT, fontSize: `${label.px}px`, fontWeight: 600 }}>
            {label.text}
          </text>,
          'mid',
          `${label.x}px ${cy}px`,
        ),
      );
    }
    const lines = hilo?.[seg.block - 1];
    if (lines) {
      const box = withNames ? { ...seg.content, top: layout.bars.top, bottom: layout.bars.bottom } : seg.content;
      mid.push(
        <div
          key={`${piece}-hilo`}
          data-piece={piece}
          data-part="body"
          data-rocket="hilo"
          className="pointer-events-none absolute flex items-center"
          style={{ ...boxStyle(box), transformOrigin: '0 0' }}
        >
          <Hilo surface="light" size={withNames ? 'rocket' : 'lg'} className="flex-1" blocks={[lines]} />
        </div>,
      );
    }
  }
  if (shows('nose')) {
    back.push(
      svg('nose', 'back', [
        <AntennaPart key="a" x0={g.antenna.x0} x1={g.antenna.x1} light={g.antenna.light} cy={cy} Tf={T} sw={sw} halo tag={false} />,
        <NosePart key="n" x1={g.xs} top={F} bottom={F + T} cy={cy} T={T} Tf={T} sw={sw} tag={false} />,
      ]),
    );
    front.push(svg('nose', 'front', <WindowPart w={g.window} sw={sw} glint={g.window.r >= 4} tag={false} />));
  }

  return (
    <div ref={root} data-rocket="" className={className || 'relative'} style={{ width: g.W, height: g.H, fontFamily: FONT, ...style }}>
      {behind}
      {back}
      {front}
      {mid}
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

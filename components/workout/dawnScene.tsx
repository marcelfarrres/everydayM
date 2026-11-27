import { useLayoutEffect, useRef } from 'react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';

/*
 * The pieces of the «Amanecer» scene (approved 26-11-2026, fondos-base.html, variant A), shared by
 * the first screen's rocket base (LaunchBase) and the creator's assembly scene (AssemblyScene): the
 * palette, the dark steel lattice tower, a car in silhouette, the far skyline and the road's lamps
 * and cars. Static SVG; only the cars move (CSS: pad-car-*).
 */

/** The dawn and the dark steel of the base. */
export const DAWN = {
  /** the page's own dark (RoutineComposer's first view: `max-lg:bg-[#2b2a28]`): the sky starts in it */
  page: '#2b2a28',
  sky: ['#2b2a28', '#4a4156', '#a5606a', '#ec9d78', '#fbd9ae'],
  skyAt: [0, 0.3, 0.6, 0.83, 1],
  sun: '#fff4d8',
  glow: '#fff1cf',
  cloud: '#f7b592',
  silhouette: '#2a2625',
  ground: ['#2f2b29', '#211e1d'],
  road: '#463f3b',
  roadEdge: '#6e655f',
  roadLine: '#f3d7a8',
  lampPost: '#4a433f',
  lamp: '#ffe6b0',
  car: '#0f0e0d',
  carEdge: '#9a8f88',
  headlight: '#fff1cf',
  /** the steel: chords, bracing, plates and the ladder (light, to read on the steel) */
  steel: '#7a6f69',
  brace: '#5a514c',
  plate: '#322e2c',
  dark: '#171514',
  ladder: '#cfc6bf',
  hazard: '#f2c230',
} as const;

/** A dark steel lattice tower: two chords, alternating diagonals, horizontals, a cap and a red beacon. */
export function SteelTower({ x, w, top, bottom }: { x: number; w: number; top: number; bottom: number }) {
  const bay = Math.max(14, Math.round(w * 1.25));
  let braces = '';
  let flip = false;
  for (let y = top; y < bottom - 1; y += bay) {
    const y2 = Math.min(bottom, y + bay);
    braces += `M${x} ${y}H${x + w}`;
    braces += flip ? `M${x + w} ${y}L${x} ${y2}` : `M${x} ${y}L${x + w} ${y2}`;
    flip = !flip;
  }
  const cx = x + w / 2;
  return (
    <g>
      <path d={braces} fill="none" stroke={DAWN.brace} strokeWidth={1} />
      <path d={`M${x} ${top - 2}V${bottom}M${x + w} ${top - 2}V${bottom}`} fill="none" stroke={DAWN.steel} strokeWidth={2.2} />
      <rect x={x - 3} y={top - 6} width={w + 6} height={4} rx={1} fill={DAWN.steel} />
      <path d={`M${cx} ${top - 6}V${top - 11}`} stroke={DAWN.steel} strokeWidth={1.2} />
      <circle cx={cx} cy={top - 12} r={6} fill={C.red} opacity={0.25} />
      <circle cx={cx} cy={top - 12} r={2.2} fill={C.red} />
    </g>
  );
}

/** A car in silhouette, nose to the right (`flip`: to the left), its top at `y`, `k` times the sketch's size. */
export function Car({ y, k, flip }: { y: number; k: number; flip: boolean }) {
  return (
    <g transform={`translate(0 ${y}) scale(${flip ? -k : k} ${k})`}>
      <path d="M20.4 4.6 L40 1 L40 9 Z" fill={DAWN.lamp} opacity={0.42} />
      <path
        d="M0 7 V4.6 Q0 3.6 1.2 3.4 L5 2.8 L7.5 .6 Q8 0 9 0 H14 Q15 0 15.6 .6 L17.6 2.9 L19.4 3.4 Q20.4 3.7 20.4 4.8 V7 Z"
        fill={DAWN.car}
        stroke={DAWN.carEdge}
        strokeWidth={0.5}
      />
      <circle cx={4.6} cy={7} r={1.7} fill={DAWN.car} />
      <circle cx={15.6} cy={7} r={1.7} fill={DAWN.car} />
      <circle cx={20} cy={4.7} r={1.2} fill={DAWN.headlight} />
      <circle cx={0.6} cy={4.7} r={1} fill={C.red} />
    </g>
  );
}

/**
 * The far skyline: hills, a hangar, a small gantry with its rocket, a water tower. Drawn on a
 * sketch 320 px wide with its horizon at y 235; `k` scales it, `hz` is the horizon, `W` the width
 * the hills reach.
 */
export function Skyline({ W, hz, k, fill = DAWN.silhouette, className, style }: { W: number; hz: number; k: number; fill?: string; className?: string; style?: React.CSSProperties }) {
  const X = (x: number) => x * k;
  const Y = (y: number) => hz + (y - 235) * k;
  return (
    <g fill={fill} className={className} style={style}>
      <path d={`M0 ${hz}V${Y(228)}Q${X(40)} ${Y(222)} ${X(84)} ${Y(229)}Q${X(130)} ${Y(233)} ${X(176)} ${Y(228)}Q${X(230)} ${Y(222)} ${W} ${Y(229)}V${hz}Z`} />
      <rect x={X(128)} y={Y(224)} width={40 * k} height={11 * k} />
      <path d={`M${X(128)} ${Y(224)}L${X(148)} ${Y(218)}L${X(168)} ${Y(224)}Z`} />
      <rect x={X(184)} y={Y(212)} width={5 * k} height={23 * k} />
      <rect x={X(181)} y={Y(209)} width={11 * k} height={3 * k} />
      <path d={`M${X(194)} ${hz}V${Y(220)}Q${X(196.5)} ${Y(213)} ${X(199)} ${Y(220)}V${hz}Z`} />
      <rect x={X(188)} y={Y(218)} width={7 * k} height={2 * k} />
      <rect x={X(188)} y={Y(227)} width={7 * k} height={2 * k} />
      <rect x={X(50)} y={Y(220)} width={3 * k} height={15 * k} />
      <path d={`M${X(44)} ${Y(220)}h${15 * k}l${-3 * k} ${-6 * k}h${-9 * k}z`} />
    </g>
  );
}

/** A street lamp standing on the road's far edge at `x` (`top`: the road's top; `q`: the road's scale). */
export function RoadLamp({ x, top, q, lit = true }: { x: number; top: number; q: number; lit?: boolean }) {
  return (
    <g>
      <path d={`M${x} ${top}V${top - 9 * q}h${4 * q}`} fill="none" stroke={DAWN.lampPost} strokeWidth={1} />
      <circle cx={x + 4 * q} cy={top - 8.4 * q} r={1.1 * q} fill={DAWN.lamp} />
      {lit && <circle cx={x + 4 * q} cy={top - 8 * q} r={3.4 * q} fill={DAWN.lamp} opacity={0.18} />}
    </g>
  );
}

/** The two thin lit clouds of the dawn (the sketch's, against the horizon `hz`, `k` times its size). */
export function DawnClouds({ hz, k }: { hz: number; k: number }) {
  const X = (x: number) => x * k;
  const Y = (y: number) => hz + (y - 235) * k;
  return (
    <>
      <path
        d={`M${X(150)} ${Y(204)}Q${X(200)} ${Y(199)} ${X(262)} ${Y(203)}Q${X(300)} ${Y(205)} ${X(320)} ${Y(201)}V${Y(206)}Q${X(280)} ${Y(209)} ${X(240)} ${Y(207)}Q${X(190)} ${Y(205)} ${X(150)} ${Y(207)}Z`}
        fill={DAWN.cloud}
        opacity={0.38}
      />
      <path d={`M0 ${Y(214)}Q${X(30)} ${Y(211)} ${X(60)} ${Y(214)}Q${X(40)} ${Y(217)} 0 ${Y(217)}Z`} fill={DAWN.cloud} opacity={0.3} />
    </>
  );
}

/** Each car's own delay in its loop (CSS: pad-car-a/b/c), s. */
const CAR_DELAYS = [-6, -2, -15];

/**
 * A few cars on the road, both ways, long gaps between them (CSS: pad-car-*; parked with reduced
 * motion). Their place in their loops follows the page's clock, so a new scene drawn over the
 * same road (the start screen giving way to the questions) has them exactly where they were.
 */
export function RoadCars({ W, top, q }: { W: number; top: number; q: number }) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const cars = ref.current?.querySelectorAll<SVGGElement>('.pad-car');
    const now = performance.now() / 1000;
    cars?.forEach((car, i) => {
      car.style.animationDelay = `${(CAR_DELAYS[i] ?? 0) - now}s`;
    });
  }, []);
  return (
    <g ref={ref} style={{ ['--pad-road' as string]: `${W}px` }}>
      <g className="pad-car pad-car-b">
        <Car y={top - 0.2 * q} k={0.95 * q} flip />
      </g>
      <g className="pad-car pad-car-a">
        <Car y={top + 8.6 * q} k={1.15 * q} flip={false} />
      </g>
      <g className="pad-car pad-car-c">
        <Car y={top + 8.6 * q} k={1.15 * q} flip={false} />
      </g>
    </g>
  );
}

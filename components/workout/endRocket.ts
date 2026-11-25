import { SHIP, shiftFor, stackGeometry, type ShipGeometry } from './rocketShape';

/*
 * The rocket of the phone's end screen (pure): the routine's rocket put back together. It is
 * rocketShape's drawing (`stackGeometry`), one stage per block, lying nose right; only its boosters
 * are placed differently. In the routine they sat along the tail half of the whole rocket and came
 * off first; here they clamp onto the stage the rocket ended with (the one against the nose), so
 * they can go on first, on a one-stage rocket, and are carried there as the other stages join at
 * the tail.
 */

/** Length of everything but the stages: the flame's room, the nozzle, the cap, the probe, half a line. */
const FIXED = SHIP.FLAME_ROOM + SHIP.NOZZLE + SHIP.CAP + SHIP.PROBE + SHIP.STROKE / 2;

export const END_ROCKET = {
  /** the screen's margins on each side */
  SIDE: 16,
  /** a stage's length: at most (a short rocket isn't stretched), at least */
  SEG_MAX: 84,
  SEG_MIN: 36,
} as const;

/** How long the finished rocket is (its frame, px) on a screen `vw` wide, and each of its stages. */
export function endFrame(vw: number, stages: number): { frame: number; seg: number } {
  const n = Math.max(1, Math.round(stages));
  const seg = Math.min(END_ROCKET.SEG_MAX, Math.max(END_ROCKET.SEG_MIN, Math.floor((vw - 2 * END_ROCKET.SIDE - FIXED) / n)));
  // (stackGeometry's frame is never shorter than 150: a one-stage rocket gets a longer stage)
  return { frame: Math.max(150, FIXED + n * seg), seg };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The two boosters, above and below the body, along the stage from `start` to `end` (rocketShape's drawing). */
function boostersOn(g: ShipGeometry, start: number, end: number): NonNullable<ShipGeometry['boosters']> {
  const { F, T, H } = g;
  const yTop = SHIP.STROKE / 2;
  const cone = r1(F * 1.5);
  const bx0 = r1(start + 4);
  const length = end - start;
  // (as long as half the stage, its cone short of the stage's front end)
  const body = Math.max(8, Math.min(length * 0.55, length - cone - 6));
  const bx1 = r1(bx0 + body);
  const band = (y0: number, y1: number) => {
    const mid = (y0 + y1) / 2;
    const half = (y1 - y0) / 2;
    return (
      `M${bx0} ${r1(y0)} L${bx1} ${r1(y0)} C${r1(bx1 + 0.55 * cone)} ${r1(y0)} ${r1(bx1 + cone)} ${r1(mid - half * 0.25)} ${r1(bx1 + cone)} ${r1(mid)} ` +
      `C${r1(bx1 + cone)} ${r1(mid + half * 0.25)} ${r1(bx1 + 0.55 * cone)} ${r1(y1)} ${bx1} ${r1(y1)} L${bx0} ${r1(y1)} Z`
    );
  };
  const bell = (mid: number, half: number) =>
    `M${bx0} ${r1(mid - half * 0.55)} L${r1(bx0 - 6)} ${r1(mid - half * 0.85)} L${r1(bx0 - 6)} ${r1(mid + half * 0.85)} L${bx0} ${r1(mid + half * 0.55)} Z`;
  const seamX = r1(bx0 + (bx1 - bx0) * 0.38);
  return {
    top: band(yTop, F),
    bottom: band(F + T, H - SHIP.STROKE / 2),
    nozzles: `${bell((yTop + F) / 2, (F - yTop) / 2)} ${bell((F + T + H - SHIP.STROKE / 2) / 2, (F - yTop) / 2)}`,
    seams: `M${seamX} ${r1(yTop + 1)} L${seamX} ${F} M${seamX} ${F + T} L${seamX} ${r1(H - SHIP.STROKE / 2 - 1)}`,
    x0: bx0,
    x1: r1(bx1 + cone),
  };
}

/**
 * The end's rocket with `stages` of its `total` stages on (the front ones: the stage it arrived
 * with is the last, `total`, against the nose; each one that joins goes on at the tail) and, if
 * `boosters`, the boosters on that front stage. Drawn in a frame `frame` px long, the whole
 * rocket's, so every stage stays where it will be; `shift` centres what is on in it.
 */
export function endShip(frame: number, total: number, stages: number, boosters: boolean): { g: ShipGeometry; shift: number } {
  const n = Math.max(1, Math.round(total));
  const on = Math.min(n, Math.max(1, Math.round(stages)));
  const g = stackGeometry({ width: frame, blocks: n, first: n - on + 1 });
  const front = g.segments[g.segments.length - 1];
  const geometry = boosters ? { ...g, boosters: boostersOn(g, front.start, front.end) } : g;
  return { g: geometry, shift: shiftFor(g) };
}

import { SHIP, shiftFor, stackGeometry, type ShipGeometry } from './rocketShape';

/*
 * The rocket of the phone's end screen (pure): the routine's rocket put back together. It is
 * rocketShape's drawing (`stackGeometry`), one stage per block, lying nose right. The boosters go
 * on first (the warm-up is crossed off first), on the one-stage rocket it arrived as, along its
 * tail end, as on any rocket; each stage that joins at the tail takes them back with it (the end
 * screen slides them there in the same beat), so the finished rocket has them exactly where the
 * routine's rocket had them at its start: along the tail half of the whole rocket.
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

/**
 * The two boosters, above and below the body, along the tail end of what is on (rocketShape's
 * drawing: from the tail, half the body long, at least 40 px), never past the nose's base.
 */
function boostersOn(g: ShipGeometry): NonNullable<ShipGeometry['boosters']> {
  const { F, T, H } = g;
  const yTop = SHIP.STROKE / 2;
  const cone = r1(F * 1.5);
  const bx0 = r1(g.x0 + 4);
  const length = g.xs - g.x0;
  // (a one-stage rocket too short for that: its cone short of the nose's base)
  const body = Math.max(8, Math.min(Math.max(40, length * 0.5), length - 4 - cone - 4));
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
 * `boosters`, the boosters along its tail end. Drawn in a frame `frame` px long, the whole
 * rocket's, so every stage stays where it will be; `shift` centres what is on in it. Complete, it
 * is exactly the routine's rocket at its start (`stackGeometry` with its boosters).
 */
export function endShip(frame: number, total: number, stages: number, boosters: boolean): { g: ShipGeometry; shift: number } {
  const n = Math.max(1, Math.round(total));
  const on = Math.min(n, Math.max(1, Math.round(stages)));
  const g = stackGeometry({ width: frame, blocks: n, first: n - on + 1, boosters: boosters && on === n });
  const geometry = boosters && on < n ? { ...g, boosters: boostersOn(g) } : g;
  return { g: geometry, shift: shiftFor(g) };
}

/**
 * Where the boosters were before stage `stages` joined (they slide back to the new tail with it),
 * as a transform of their drawing at its new place: null if they don't move.
 */
export function boosterSlide(frame: number, total: number, stages: number): { from: string; origin: string } | null {
  const before = endShip(frame, total, stages - 1, true).g.boosters;
  const after = endShip(frame, total, stages, true).g.boosters;
  if (!before || !after || stages <= 1) return null;
  const k = (before.x1 - before.x0) / (after.x1 - after.x0);
  return { from: `translateX(${r1(before.x0 - after.x0)}px) scaleX(${Math.round(k * 1000) / 1000})`, origin: `${after.x0}px 0px` };
}

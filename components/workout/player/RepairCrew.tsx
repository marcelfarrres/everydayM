'use client';

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { ShipGeometry } from '@/components/workout/rocketShape';
import { STANDS, repairPlan, type RepairPlan } from '@/components/workout/rocketFlight';

/*
 * The repair of a rest (phone): two little line-drawn mechanics (white, ink line, a cap in the
 * rest's blue) come in from both sides, set stands under the rocket and work on it: one hammers
 * at the tail (anticipation, blow, spark, the rocket jolts), the other turns a wrench at the nose
 * in two goes, a third of a beat behind; now and then they cross over; near the end they hurry,
 * take the stands away and run off, and the rocket drops into place with its "¡pam!" at 0.
 *
 * The choreography is `repairPlan` (rocketFlight.ts), measured from the moment the rocket parks;
 * here it becomes Web Animations of a few small parts (transform and opacity only), all put on the
 * timeline at once, anchored to that moment, paused with the routine. With a talk on, they work
 * calmly (slower, no sparks or jolts). With reduced motion they just stand by the rocket.
 */

const INK = '#131313';
const BLUE = '#2f6bff';
// a mechanic's box: about 1.2 times the body's thickness
const MW = 22;
const MH = 36;
// smoke and dust: this many puffs, each used again once it has gone
const SMOKE_SLOTS = 10;

type Track = [t: number, value: string, easing?: string][];

/** One property's keyframes over `D` ms, from moments in time (sorted, one value per moment). */
function keys(track: Track, D: number, prop: 'transform' | 'opacity' = 'transform'): Keyframe[] {
  const sorted = [...track].sort((a, b) => a[0] - b[0]);
  const out: Keyframe[] = [];
  let last = -1;
  for (const [t, value, easing] of sorted) {
    const offset = Math.min(1, Math.max(0, t / D));
    if (offset <= last) continue;
    last = offset;
    out.push({ offset, [prop]: value, ...(easing ? { easing } : {}) });
  }
  if (out.length && (out[0].offset as number) > 0) out.unshift({ ...out[0], offset: 0 });
  if (out.length && (out[out.length - 1].offset as number) < 1) out.push({ ...out[out.length - 1], offset: 1, easing: undefined });
  return out;
}

interface Places {
  /** where each stands to work (box's left, frame px), the impact points, and beyond the screen */
  tail: number;
  nose: number;
  offLeft: number;
  offRight: number;
  ground: number;
  /** the rocket's ends and middle line (for the smoke) */
  tailEnd: number;
  noseEnd: number;
  cy: number;
}

/** Everything that moves, as tracks over the plan's time. */
function choreography(plan: RepairPlan, p: Places) {
  const D = plan.exitEnd + 60;
  const A = { x: [] as Track, face: [] as Track, legL: [] as Track, legR: [] as Track, arm: [] as Track, back: [] as Track, head: [] as Track };
  const B = { x: [] as Track, face: [] as Track, legL: [] as Track, legR: [] as Track, arm: [] as Track, back: [] as Track, head: [] as Track };
  const lift: Track = [[0, 'translateY(0px) scaleY(1)']];
  const stands: Track = [[0, 'scaleY(0)']];
  const sparks: Track = [[0, '0']];
  const sparkAt: Track = [[0, `translate(${p.tail + MW}px, 0px) scale(1)`]];
  // a puff at (x, y) (its middle) that drifts by (dx, dy), grows and fades over `life` ms
  const smoke = Array.from({ length: SMOKE_SLOTS }, () => ({ at: [[0, 'translate(0px, 0px) scale(0)']] as Track, op: [[0, '0']] as Track, free: 0 }));
  const puff = (t: number, x: number, y: number, dx: number, dy: number, size: number, life: number) => {
    const slot = smoke.find((one) => one.free <= t - 20);
    if (!slot || t < 0) return;
    slot.free = t + life + 40;
    const at = (px: number, py: number, k: number) => `translate(${Math.round(px - 11)}px, ${Math.round(py - 7.5)}px) scale(${k.toFixed(2)})`;
    slot.at.push([t - 2, at(x, y, 0.35 * size), 'cubic-bezier(0.2, 0.6, 0.4, 1)'], [t + life, at(x + dx, y + dy, 1.5 * size)]);
    slot.op.push([t - 2, '0', 'ease-out'], [t + 110, '1', 'ease-in'], [t + life, '0']);
  };
  // dust at the feet of one running from x0 to x1 between `from` and `to`
  const ground = p.ground - 5;
  const dustRun = (from: number, to: number, x0: number, x1: number) => {
    const dir = Math.sign(x1 - x0) || 1;
    for (let t = from + 60; t < to - 40; t += 170) {
      const x = x0 + ((x1 - x0) * (t - from)) / (to - from) + MW / 2;
      puff(t, x - dir * 6, ground, -dir * 12, -5, 0.55, 420);
    }
  };

  const walk = (who: typeof A, from: number, to: number, x0: number, x1: number, y = 0) => {
    who.x.push([from, `translate(${x0}px, ${y}px)`, 'cubic-bezier(0.45, 0, 0.55, 1)']);
    // a little past it and back (the brake)
    const over = x1 + Math.sign(x1 - x0) * 5;
    who.x.push([to - 110, `translate(${over}px, ${y}px)`, 'cubic-bezier(0.3, 0, 0.4, 1)']);
    who.x.push([to, `translate(${x1}px, 0px)`]);
    for (let t = from, i = 0; t < to - 110; t += 140, i++) {
      who.legL.push([t, `rotate(${i % 2 ? 28 : -28}deg)`, 'ease-in-out']);
      who.legR.push([t, `rotate(${i % 2 ? -28 : 28}deg)`, 'ease-in-out']);
      who.back.push([t, `rotate(${i % 2 ? -22 : 22}deg)`, 'ease-in-out']);
    }
    who.legL.push([to - 60, 'rotate(0deg)']);
    who.legR.push([to - 60, 'rotate(0deg)']);
    who.back.push([to - 60, 'rotate(6deg)']);
    dustRun(from, to - 110, x0, x1);
  };
  // turning round is quick (70 ms): it holds the way it faced until then
  const facing = new Map<typeof A, boolean>();
  const turnTo = (who: typeof A, t: number, right: boolean) => {
    const was = facing.get(who);
    if (was === right) return;
    if (was !== undefined) who.face.push([t - 70, `scaleX(${was ? 1 : -1})`, 'ease-in-out']);
    who.face.push([t, `scaleX(${right ? 1 : -1})`]);
    facing.set(who, right);
  };

  // in: from either side, the second a little later, each with a brake and a puff of dust
  const aIn = plan.enterEnd - 120;
  A.x.push([0, `translate(${p.offLeft}px, 0px)`]);
  B.x.push([0, `translate(${p.offRight}px, 0px)`]);
  turnTo(A, 0, true);
  turnTo(B, 0, false);
  walk(A, 0, aIn, p.offLeft, p.tail);
  walk(B, 120, plan.enterEnd, p.offRight, p.nose);
  // (and a puff as each brakes)
  puff(aIn - 100, p.tail + MW / 2 + 8, ground, 10, -6, 0.8, 480);
  puff(plan.enterEnd - 90, p.nose + MW / 2 - 8, ground, -10, -6, 0.8, 480);
  // the stands go in and the rocket comes up a little, with a bounce
  stands.push([plan.enterEnd - 150, 'scaleY(0)', 'cubic-bezier(0.3, 1.6, 0.5, 1)'], [plan.enterEnd + 60, 'scaleY(1)']);
  lift.push(
    [plan.enterEnd - 60, 'translateY(0px) scaleY(1)', 'cubic-bezier(0.3, 0, 0.4, 1)'],
    [plan.enterEnd + 90, `translateY(${-STANDS.liftPx - 1.4}px) scaleY(1)`, 'cubic-bezier(0.4, 0, 0.4, 1)'],
    [plan.enterEnd + 200, `translateY(${-STANDS.liftPx + 0.6}px) scaleY(1)`],
    [plan.enterEnd + 300, `translateY(${-STANDS.liftPx}px) scaleY(1)`],
  );
  // at work: the hammer rests forward and down, the wrench held out at the nose
  A.arm.push([0, 'rotate(-20deg)'], [aIn + 40, 'rotate(-55deg)']);
  B.arm.push([0, 'rotate(-20deg)'], [plan.enterEnd + 40, 'rotate(-95deg)']);

  // which side each is on, as they cross over
  let aAtTail = true;
  const sideAt = (t: number) => {
    let atTail = true;
    for (const [s] of plan.swaps) if (t > s) atTail = !atTail;
    return atTail;
  };
  for (const [s, e] of plan.swaps) {
    const aFrom = aAtTail ? p.tail : p.nose;
    const aTo = aAtTail ? p.nose : p.tail;
    turnTo(A, s, aAtTail);
    turnTo(B, s, !aAtTail);
    A.arm.push([s, 'rotate(-20deg)']);
    B.arm.push([s, 'rotate(-20deg)']);
    walk(A, s, e, aFrom, aTo, -1);
    // the other one ducks as they pass
    B.x.push([s, `translate(${aTo}px, 0px)`]);
    walk(B, s + 80, e + 80, aTo, aFrom, 4);
    aAtTail = !aAtTail;
    turnTo(A, e, aAtTail);
    turnTo(B, e + 80, !aAtTail);
    A.arm.push([e + 60, 'rotate(-55deg)']);
    B.arm.push([e + 140, 'rotate(-95deg)']);
  }

  const beats = (list: number[]) => list.map((t, i) => Math.min(650, (list[i + 1] ?? t + 650) - t));
  // the hammer: up (and a moment held), the blow, a bounce, back; head and back arm a little late
  plan.hits.forEach((h, i) => {
    const b = beats(plan.hits)[i];
    A.arm.push(
      [h - 0.58 * b, 'rotate(-55deg)', 'cubic-bezier(0.2, 0.6, 0.4, 1)'],
      [h - 0.3 * b, 'rotate(-165deg)'],
      [h - 0.12 * b, 'rotate(-170deg)', 'cubic-bezier(0.6, 0, 0.9, 0.5)'],
      [h, 'rotate(-62deg)', 'cubic-bezier(0.2, 0.7, 0.4, 1)'],
      [h + 0.08 * b, 'rotate(-48deg)', 'ease-in-out'],
      [h + 0.25 * b, 'rotate(-55deg)'],
    );
    A.head.push([h - 0.3 * b, 'rotate(-6deg)', 'ease-out'], [h + 40, 'rotate(7deg)', 'ease-out'], [h + 0.3 * b, 'rotate(0deg)']);
    A.back.push([h - 0.3 * b, 'rotate(-14deg)', 'ease-out'], [h + 60, 'rotate(10deg)', 'ease-out'], [h + 0.35 * b, 'rotate(4deg)']);
    if (plan.sparks) {
      const atTail = sideAt(h);
      const x = atTail ? p.tail + MW + 2 : p.nose - 10;
      sparkAt.push(
        [h - 1, `translate(${x}px, 0px) scale(0.3)`, 'cubic-bezier(0.2, 0.8, 0.3, 1.4)'],
        [h + 50, `translate(${x}px, 0px) scale(1.25)`, 'ease-in'],
        [h + 190, `translate(${x}px, 0px) scale(0.7)`],
      );
      sparks.push([h - 1, '0'], [h + 10, '1'], [h + 190, '0']);
      // a little smoke from the blow
      puff(h + 20, x + 6, p.cy + 2, atTail ? -6 : 6, -8, 0.55, 500);
      lift.push(
        [h - 1, `translateY(${-STANDS.liftPx}px) scaleY(1)`, 'cubic-bezier(0.2, 0.8, 0.4, 1)'],
        [h + 50, `translateY(${-STANDS.liftPx + 1.6}px) scaleY(0.97)`, 'cubic-bezier(0.4, 0, 0.4, 1)'],
        [h + 180, `translateY(${-STANDS.liftPx}px) scaleY(1)`],
      );
    }
  });
  // the wrench: a turn in two goes, and back
  plan.turns.forEach((t, i) => {
    const b = beats(plan.turns)[i];
    B.arm.push(
      [t - 0.32 * b, 'rotate(-95deg)', 'ease-out'],
      [t - 0.16 * b, 'rotate(-102deg)', 'cubic-bezier(0.5, 0, 0.5, 1)'],
      [t, 'rotate(-76deg)', 'ease-out'],
      [t + 0.12 * b, 'rotate(-78deg)', 'cubic-bezier(0.5, 0, 0.5, 1)'],
      [t + 0.3 * b, 'rotate(-56deg)', 'ease-in-out'],
      [t + 0.55 * b, 'rotate(-95deg)'],
    );
    B.head.push([t - 0.1 * b, 'rotate(4deg)', 'ease-out'], [t + 0.3 * b, 'rotate(-5deg)', 'ease-in-out'], [t + 0.6 * b, 'rotate(0deg)']);
  });
  // A long rest's breaks: the one with the hammer wipes his brow and then looks the rocket over;
  // the other sits down on the toolbox; back to work as the break ends
  const toolbox: Track = [[0, '0']];
  plan.breaks.forEach(([a, b]) => {
    const aAtTail = sideAt(a);
    const ax = aAtTail ? p.tail : p.nose;
    const bx = aAtTail ? p.nose : p.tail;
    A.arm.push(
      [a, 'rotate(-55deg)', 'cubic-bezier(0.3, 0, 0.3, 1)'],
      [a + 450, 'rotate(-150deg)', 'ease-in-out'],
      [a + 800, 'rotate(-138deg)', 'ease-in-out'],
      [a + 1150, 'rotate(-155deg)', 'ease-in-out'],
      [a + 1500, 'rotate(-140deg)', 'cubic-bezier(0.4, 0, 0.3, 1)'],
      [a + 2000, 'rotate(-18deg)'],
      [b - 400, 'rotate(-18deg)', 'cubic-bezier(0.4, 0, 0.3, 1)'],
      [b, 'rotate(-55deg)'],
    );
    A.head.push([a + 300, 'rotate(0deg)', 'ease-out'], [a + 600, 'rotate(-8deg)', 'ease-in-out'], [a + 2200, 'rotate(-8deg)', 'ease-in-out'], [a + 2600, 'rotate(9deg)'], [b - 500, 'rotate(9deg)', 'ease-in-out'], [b, 'rotate(0deg)']);
    A.x.push([a + 2100, `translate(${ax}px, 0px)`, 'ease-in-out'], [a + 2600, `translate(${ax + (aAtTail ? 6 : -6)}px, 0px)`], [b - 300, `translate(${ax + (aAtTail ? 6 : -6)}px, 0px)`, 'ease-in-out'], [b, `translate(${ax}px, 0px)`]);
    B.arm.push([a + 100, 'rotate(-95deg)', 'ease-in-out'], [a + 500, 'rotate(-15deg)'], [b - 300, 'rotate(-15deg)', 'ease-in-out'], [b + 100, 'rotate(-95deg)']);
    B.x.push([a + 200, `translate(${bx}px, 0px)`, 'cubic-bezier(0.4, 0, 0.3, 1)'], [a + 650, `translate(${bx}px, 6px)`], [b - 350, `translate(${bx}px, 6px)`, 'cubic-bezier(0.4, 0, 0.3, 1)'], [b, `translate(${bx}px, 0px)`]);
    B.legL.push([a + 200, 'rotate(0deg)', 'ease-out'], [a + 650, 'rotate(-78deg)'], [b - 350, 'rotate(-78deg)', 'ease-in'], [b, 'rotate(0deg)']);
    B.legR.push([a + 200, 'rotate(0deg)', 'ease-out'], [a + 650, 'rotate(-70deg)'], [b - 350, 'rotate(-70deg)', 'ease-in'], [b, 'rotate(0deg)']);
    B.head.push([a + 900, 'rotate(0deg)', 'ease-in-out'], [a + 1300, 'rotate(10deg)', 'ease-in-out'], [b - 600, 'rotate(10deg)', 'ease-in-out'], [b - 200, 'rotate(0deg)']);
    toolbox.push([a + 150, '0', 'ease-out'], [a + 400, '1'], [b - 200, '1', 'ease-in'], [b + 100, '0']);
  });

  // smoke at either end, now one, now the other; one in three rises higher and comes apart
  const size = plan.calm ? 0.7 : 1.15;
  plan.puffs.forEach((t, i) => {
    const high = i % 3 === 2 ? 1.6 : 1;
    if (i % 2) puff(t, p.noseEnd + 2, p.cy - 4, 12, -10 * high, size, 900 * high);
    else puff(t, p.tailEnd - 4, p.cy - 2, -14, -9 * high, size, 900 * high);
  });

  // out: the stands come away (the rocket down to just above its place), and each runs off its way
  const s = plan.exitStart;
  stands.push([s, 'scaleY(1)', 'cubic-bezier(0.5, 0, 0.8, 0.4)'], [s + 180, 'scaleY(0)']);
  lift.push([s, `translateY(${-STANDS.liftPx}px) scaleY(1)`, 'cubic-bezier(0.4, 0, 0.6, 1)'], [s + 220, `translateY(${-STANDS.lowPx}px) scaleY(1)`]);
  const aEnd = aAtTail;
  const out = (who: typeof A, atTail: boolean, delay: number) => {
    const from = atTail ? p.tail : p.nose;
    const to = atTail ? p.offLeft : p.offRight;
    turnTo(who, s + delay, !atTail);
    who.arm.push([s + delay, 'rotate(-20deg)']);
    who.x.push([s + delay, `translate(${from}px, 0px)`, 'cubic-bezier(0.5, 0, 0.9, 0.6)'], [plan.exitEnd - (delay ? 0 : 60), `translate(${to}px, 0px)`]);
    for (let t = s + delay, i = 0; t < plan.exitEnd; t += 110, i++) {
      who.legL.push([t, `rotate(${i % 2 ? 30 : -30}deg)`]);
      who.legR.push([t, `rotate(${i % 2 ? -30 : 30}deg)`]);
    }
    dustRun(s + delay, plan.exitEnd, from, to);
  };
  out(A, aEnd, 0);
  out(B, !aEnd, 90);
  return { D, A, B, lift, stands, sparks, sparkAt, smoke, toolbox };
}

/** One little mechanic: legs, body, head with its cap, two arms; the hammer or the wrench. */
function Mechanic({ id, tool }: { id: 'a' | 'b'; tool: 'hammer' | 'wrench' }) {
  const part = (name: string, style: CSSProperties, svg: ReactNode, w: number, h: number) => (
    <div data-part={`${id}-${name}`} className="absolute" style={{ ...style, width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
        {svg}
      </svg>
    </div>
  );
  return (
    <div data-part={`${id}-face`} className="absolute inset-0" style={{ transformOrigin: `${MW / 2}px ${MH}px` }}>
      {part('back', { left: 6.5, top: 13, transformOrigin: '2px 1px' }, <rect x={0.6} y={0.6} width={2.8} height={9.4} rx={1.4} />, 4, 11)}
      {part('legL', { left: 7, top: 23, transformOrigin: '2px 1px' }, <rect x={0.6} y={0.6} width={2.8} height={12} rx={1.2} />, 4, 13)}
      {part('legR', { left: 11.5, top: 23, transformOrigin: '2px 1px' }, <rect x={0.6} y={0.6} width={2.8} height={12} rx={1.2} />, 4, 13)}
      <div className={`absolute ${id === 'a' ? 'rc-breathe' : 'rc-breathe-b'}`} style={{ left: 5.5, top: 11.5, width: 11, height: 13, transformOrigin: '50% 100%' }}>
        <svg width={11} height={13} viewBox="0 0 11 13" className="block overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.3}>
          <rect x={0.6} y={0.6} width={9.8} height={11.8} rx={3} />
          <path d="M3 4.5 H8" strokeWidth={0.9} strokeOpacity={0.6} />
        </svg>
      </div>
      {part(
        'head',
        { left: 6, top: 1, transformOrigin: '5px 10px' },
        <>
          <circle cx={5} cy={5.6} r={4.3} />
          {/* the cap, in the rest's blue */}
          <path d="M0.9 4.8 C1.4 1.4 8.6 1.4 9.1 4.8 L11.6 5.3" fill={BLUE} stroke={INK} strokeWidth={1.1} />
        </>,
        10,
        11,
      )}
      {part(
        'arm',
        { left: 12.5, top: 13, transformOrigin: '2px 1px' },
        <>
          <rect x={0.6} y={0.6} width={2.8} height={9.4} rx={1.4} />
          {tool === 'hammer' ? (
            <>
              <path d="M2 9 L2 17" strokeWidth={1.6} />
              <rect x={-1.5} y={15.5} width={7} height={3.4} rx={0.8} fill={INK} stroke="none" />
            </>
          ) : (
            <>
              <path d="M2 9 L2 17.5" strokeWidth={1.8} />
              <path d="M-0.6 17 C-0.6 20.6 4.6 20.6 4.6 17 L3.2 17.6 L0.8 17.6 Z" fill="#fff" strokeWidth={1.1} />
            </>
          )}
        </>,
        4,
        11,
      )}
    </div>
  );
}

const Puff = () => (
  <svg viewBox="0 0 26 18" className="block h-full w-full overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
    <path d="M5 15 A4.5 4.5 0 0 1 4.5 6.4 A6 6 0 0 1 15.5 4.2 A5 5 0 0 1 22.6 9.6 A3.8 3.8 0 0 1 20.5 15 Z" />
  </svg>
);

export function RepairCrew({
  g,
  timing,
  calm,
  paused,
  reduced,
  bail,
  view,
  liftRef,
}: {
  g: ShipGeometry;
  /** when the rocket parks (performance.now() time) and how long until the rest ends from then */
  timing: () => { startAt: number; parkedMs: number };
  calm: boolean;
  paused: boolean;
  reduced: boolean;
  /** the rest ended early ("Saltar"): they run off now */
  bail: boolean;
  /** the screen's edges, in the rocket's own px (left is negative when the drawing starts on screen) */
  view: { left: number; right: number };
  /** the layer that lifts the rocket on its stands (and gives the jolts) */
  liftRef: RefObject<HTMLDivElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  // at the rocket's real ends (it may be short and centred), never off the screen
  const offLeft = Math.round(view.left - MW - 30);
  const offRight = Math.round(view.right + 30);
  const places: Places = {
    tail: Math.round(Math.max(g.xe - MW - 2, view.left + 4)),
    nose: Math.round(Math.min(g.tip + 2, view.right - MW - 4)),
    offLeft,
    offRight,
    ground: g.H,
    tailEnd: g.xe,
    noseEnd: g.tip,
    cy: g.cy,
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const { startAt, parkedMs } = timing();
    const plan = repairPlan(parkedMs, calm);
    if (plan.none || reduced) {
      el.style.opacity = plan.none ? '0' : '1';
      return;
    }
    const c = choreography(plan, places);
    const now = performance.now();
    // anchored to the clock (a page in the background starts its animations late otherwise)
    const options: KeyframeAnimationOptions = { duration: c.D, delay: startAt - now, fill: 'both' };
    const add = (node: Element, frames: Keyframe[], o = options) => {
      const a = node.animate(frames, o);
      a.startTime = now;
      if (paused) a.pause();
      anims.current.push(a);
    };
    const run = (selector: string, track: Track, prop: 'transform' | 'opacity' = 'transform') => {
      const node = el.querySelector<HTMLElement>(`[data-part="${selector}"]`);
      if (node && track.length) add(node, keys(track, c.D, prop));
    };
    // nobody is seen before the rocket has parked (it may still be in the clouds)
    add(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: startAt - now, fill: 'both' });
    for (const [id, who] of [['a', c.A], ['b', c.B]] as const) {
      run(`${id}-x`, who.x);
      run(`${id}-face`, who.face);
      run(`${id}-legL`, who.legL);
      run(`${id}-legR`, who.legR);
      run(`${id}-arm`, who.arm);
      run(`${id}-back`, who.back);
      run(`${id}-head`, who.head);
    }
    run('b-box', c.toolbox, 'opacity');
    run('stands', c.stands);
    run('spark', c.sparks, 'opacity');
    run('spark-at', c.sparkAt);
    c.smoke.forEach((one, i) => {
      run(`smoke-${i}`, one.at);
      run(`smoke-${i}`, one.op, 'opacity');
    });
    const lift = liftRef.current;
    if (lift) add(lift, keys(c.lift, c.D));
    const list = anims.current;
    return () => {
      // (gone: its animations go too; React's dev double mount runs this effect again)
      list.forEach((a) => a.cancel());
      list.length = 0;
    };
    // (once: the plan is fixed when the rest begins)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // paused with the routine
  useLayoutEffect(() => {
    anims.current.forEach((a) => {
      if (paused && a.playState === 'running') a.pause();
      else if (!paused && a.playState === 'paused') a.play();
    });
  }, [paused]);

  // "Saltar": everyone off in a hurry, from wherever they are
  useLayoutEffect(() => {
    const el = root.current;
    if (!bail || !el) return;
    const quick: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' };
    for (const id of ['a', 'b'] as const) {
      const node = el.querySelector<HTMLElement>(`[data-part="${id}-x"]`);
      if (!node) continue;
      const from = getComputedStyle(node).transform;
      const x = new DOMMatrix(from === 'none' ? undefined : from).m41;
      const to = x < (places.tail + places.nose) / 2 ? offLeft : offRight;
      node.getAnimations().forEach((a) => a.cancel());
      node.animate([{ transform: from === 'none' ? 'none' : from }, { transform: `translate(${to}px, 0px)` }], quick);
    }
    // (the rocket's lift is left to the "¡pam!", which takes it from where it is)
    anims.current.forEach((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (target && target !== liftRef.current && target !== el && !target.matches('[data-part$="-x"]')) a.cancel();
    });
    el.querySelectorAll<HTMLElement>('[data-part="stands"], [data-part="spark"]').forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bail]);

  const top = places.ground - MH;
  // a stand: from the ground up to the lifted body
  const standTop = g.F + g.T - STANDS.liftPx;
  const standH = g.H - standTop;
  // (white legs with an ink edge: they read on a dark video and on a light one)
  const standPath = `M1.5 ${standH - 1} L7 1.5 L12.5 ${standH - 1} M3.8 ${standH * 0.62} H10.2 M4 1.5 H10`;
  const stand = (x: number) => (
    <svg key={x} width={14} height={standH} viewBox={`0 0 14 ${standH}`} className="absolute overflow-visible" style={{ left: x - 7, top: standTop }} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={standPath} stroke={INK} strokeWidth={3.6} />
      <path d={standPath} stroke="#fff" strokeWidth={1.4} />
    </svg>
  );
  return (
    <div ref={root} aria-hidden="true" data-paused={paused ? '' : undefined} className="pointer-events-none absolute inset-0">
      {/* the stands, under the body near either end */}
      <div data-part="stands" className="absolute inset-0" style={{ transformOrigin: `0px ${g.H}px`, transform: 'scaleY(0)' }}>
        {stand(g.x0 + 12)}
        {stand(g.xs - 12)}
      </div>
      {/* smoke at either end now and then */}
      {Array.from({ length: SMOKE_SLOTS }, (_, i) => (
        <div key={i} data-part={`smoke-${i}`} className="absolute left-0 top-0" style={{ width: 22, height: 15, opacity: 0, transformOrigin: '50% 50%' }}>
          <Puff />
        </div>
      ))}
      {(['a', 'b'] as const).map((id) => (
        <div
          key={id}
          data-part={`${id}-x`}
          className="absolute left-0"
          style={{ top, width: MW, height: MH, transform: `translate(${id === 'a' ? (reduced ? places.tail : offLeft) : reduced ? places.nose : offRight}px, 0px)` }}
        >
          {id === 'b' && (
            // the toolbox he sits on in a break (it stays on the ground as he sits)
            <svg data-part="b-box" width={18} height={11} viewBox="0 0 18 11" className="absolute overflow-visible" style={{ left: 2, top: MH - 17, opacity: 0 }} fill="#fff" stroke={INK} strokeWidth={1.2} strokeLinejoin="round">
              <rect x={0.6} y={3} width={16.8} height={7.4} rx={1.2} />
              <path d="M6 3 V1 H12 V3" fill="none" />
              <path d="M0.6 6 H17.4" strokeWidth={0.8} fill="none" />
            </svg>
          )}
          <div className={`absolute inset-0 ${id === 'a' ? 'rc-nod' : 'rc-nod-b'}`}>
            <Mechanic id={id} tool={id === 'a' ? 'hammer' : 'wrench'} />
          </div>
        </div>
      ))}
      {/* a spark at each blow, and dust at their feet */}
      <div data-part="spark-at" className="absolute left-0" style={{ top: g.cy - 14 }}>
        <svg data-part="spark" width={18} height={18} viewBox="-6 -6 12 12" className="block overflow-visible" style={{ opacity: 0 }} fill="#fff" stroke={INK} strokeWidth={1}>
          <path d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4 Z" />
        </svg>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { PadRocket } from '@/components/workout/PadRocket';
import type { PadRocketGeometry } from '@/components/workout/padRocketShape';
import { DAWN } from '@/components/workout/dawnScene';
import { NOSE_CARRY, noseCarryEnd } from '@/components/workout/assembly';

/*
 * The typed sentence's nose carried by the crane (phone): from the first page's bar (the nose piece
 * you wrote in, lying, hanging from its spreader bar) to where the rocket's nose hangs on the
 * questions' screen. The crane lifts it, turns it upright and shrinks it to the real nose's size
 * (its long hull shortened from the flat end, out of sight as it turns), and it arrives exactly on
 * the scene's own nose, which then takes over (the typed words give way to the focus label there).
 * Over everything (the first page fades under it); transforms, opacity and a clip only.
 */

/** Where the questions' nose hangs, on the screen: its centre line, its top (the antenna's light), its length and thickness. */
export interface NoseSpot {
  cx: number;
  top: number;
  len: number;
  T: number;
}

export function NoseCarry({
  from,
  g,
  text,
  textLeft,
  textTop,
  textWidth,
  to,
  onDone,
}: {
  /** the bar's nose drawing on the screen (its svg's box) */
  from: { left: number; top: number };
  g: PadRocketGeometry;
  text: string;
  /** where the words sat in the drawing, px */
  textLeft: number;
  textTop: number;
  textWidth: number;
  to: NoseSpot;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLSpanElement>(null);
  const rigRef = useRef<SVGSVGElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const end = noseCarryEnd({ left: from.left, top: from.top, W: g.W, H: g.H, T: g.T }, to);
    const total = NOSE_CARRY.liftMs + NOSE_CARRY.carryMs;
    const lifted = NOSE_CARRY.liftMs / total;
    const anims = [
      el.animate(
        [
          { transform: 'none', clipPath: 'inset(-60px 0px -4px 0px)', easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
          { transform: `translateY(${-NOSE_CARRY.liftPx}px) rotate(-4deg)`, clipPath: 'inset(-60px 0px -4px 0px)', offset: lifted, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
          { transform: end.transform, clipPath: `inset(-60px 0px -4px ${end.clipLeft.toFixed(1)}px)` },
        ],
        { duration: total, fill: 'forwards' },
      ),
    ];
    const words = wordsRef.current;
    if (words) anims.push(words.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { duration: total, fill: 'forwards' }));
    const rig = rigRef.current;
    if (rig) anims.push(rig.animate([{ opacity: 1 }, { opacity: 1, offset: lifted }, { opacity: 0, offset: lifted + 0.2 }, { opacity: 0 }], { duration: total, fill: 'forwards' }));
    const t = setTimeout(() => done.current(), total + NOSE_CARRY.holdMs);
    return () => {
      clearTimeout(t);
      anims.forEach((a) => a.cancel());
    };
    // (once, from where it was to where it goes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mid = g.W / 2;
  const top = g.body.top;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 lg:hidden">
      <div ref={ref} className="absolute [transform-origin:50%_50%]" style={{ left: from.left, top: from.top, width: g.W, height: g.H }}>
        {/* its spreader bar and the crane's cable (they let go as it turns) */}
        <svg ref={rigRef} width={g.W} height={60} viewBox={`0 ${-60 + top} ${g.W} 60`} className="absolute left-0 overflow-visible" style={{ top: top - 60 }}>
          <path d={`M${mid} ${top - 60}V${top - 30}`} stroke="#131313" strokeWidth={1.4} />
          <rect x={mid - g.W * 0.25} y={top - 30} width={g.W * 0.5} height={5} rx={1} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1} />
          <path d={`M${mid - g.W * 0.24} ${top - 25}L${mid - g.W * 0.18} ${top}M${mid + g.W * 0.24} ${top - 25}L${mid + g.W * 0.18} ${top}`} stroke="#131313" strokeWidth={1.2} />
        </svg>
        <PadRocket g={g} parts={{ flame: false, fins: false, hatch: false, tail: false }} className="absolute left-0 top-0" />
        <span ref={wordsRef} className="absolute overflow-hidden text-ellipsis whitespace-nowrap text-lg font-medium leading-6 text-ink" style={{ left: textLeft, top: textTop, maxWidth: textWidth }}>
          {text}
        </span>
      </div>
    </div>
  );
}

/** How far the crane's arm reaches above the nose bar's top, px (its top edge, the red light's too). */
export const noseCraneReach = (g: PadRocketGeometry) => Math.max(0, 44 - g.body.top);

/**
 * The first page's crane holding the nose you write in (phone): its arm comes in from the right
 * edge just above the bar, a trolley over the middle, a short cable and a spreader bar with two
 * slings down to the hull. Drawn inside the bar's box (`g`: its nose drawing, `hang`: how far the
 * drawing reaches left of the box, `width`: the box's width, `reach`: how far right of the box the
 * screen's edge is).
 */
export function NoseCrane({ g, hang, width, reach }: { g: PadRocketGeometry; hang: number; width: number; reach: number }) {
  const hull = g.body.top;
  const rig = 46;
  const mid = g.W / 2 - hang;
  const x0 = mid - 26;
  const x1 = width + reach;
  const y = (dy: number) => rig - hull + dy; // a y measured from the hull's top, in the svg
  const jibTop = y(hull - 44);
  const jibBot = jibTop + 10;
  let zig = '';
  for (let x = x0; x < x1; x += 14) zig += `M${x} ${jibBot}L${x + 7} ${jibTop}L${x + 14} ${jibBot}`;
  const spread = y(hull - 16);
  const half = g.W * 0.25;
  return (
    <svg aria-hidden="true" width={x1} height={rig} viewBox={`0 0 ${x1} ${rig}`} className="pointer-events-none absolute left-0 overflow-visible lg:hidden" style={{ top: hull - rig }}>
      {/* the arm and its trolley: they stay put while the nose is lowered over the keyboard (--nose-lower) */}
      <g className="nose-arm">
        <path d={`M${x0} ${jibTop}H${x1}M${x0} ${jibBot}H${x1}${zig}`} stroke={DAWN.steel} strokeWidth={1.6} fill="none" />
        <circle cx={x0 + 1} cy={(jibTop + jibBot) / 2} r={4.6} fill="#ff3b30" opacity={0.25} />
        <circle cx={x0 + 1} cy={(jibTop + jibBot) / 2} r={2} fill="#ff3b30" />
        <rect x={mid - 8} y={jibBot} width={16} height={6} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1} />
      </g>
      {/* the cable, paid out as the nose goes down */}
      <path className="nose-cable" d={`M${mid} ${jibBot + 6}V${spread}`} stroke="#131313" strokeWidth={1.4} style={{ ['--cable-len' as string]: spread - jibBot - 6 }} />
      <rect x={mid - half} y={spread} width={2 * half} height={5} rx={1} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1} />
      <path d={`M${mid - half + 4} ${spread + 5}L${mid - half * 0.72} ${rig}M${mid + half - 4} ${spread + 5}L${mid + half * 0.72} ${rig}`} stroke="#131313" strokeWidth={1.2} />
    </svg>
  );
}

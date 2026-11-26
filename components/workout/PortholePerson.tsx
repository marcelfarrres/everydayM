'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * What the creator's big porthole shows while the routine's rocket is being built (phone): a
 * little person in a room, standing by a door. On each answer he walks out through the door and
 * comes back with one more piece of sports kit: street clothes (0) → sports trousers (1) → sports
 * trousers and shirt (2) → fully ready, with a «vamos» gesture (3). Plain SVG and CSS (asm-pp-*
 * in globals.css): transforms and opacity only.
 *
 * Its whole input is `outfit` (the step to show) and `transition` (how a change of step plays:
 * `walk` out of the door and back, or `cut` straight to it, as with reduced motion).
 *
 * LATER: this is a stand-in for real video of Marcel. Each outfit will be three clips cut from
 * one take: "enter" (comes in through the door), "idle" (a seamless loop standing there) and
 * "exit" (goes out through the door). A change of outfit then plays exit (old outfit) → enter
 * (new outfit) → idle loop (new outfit), and `transition: 'cut'` jumps to the new idle loop. Keep
 * this component's props as they are and swap its inside for those clips.
 */

export type Outfit = 0 | 1 | 2 | 3;
export type OutfitTransition = 'walk' | 'cut';

/** How long he takes to walk to the door (and back), ms. */
export const PERSON_WALK_MS = 650;

type Phase = 'idle' | 'out' | 'in';

const SKIN = '#e0b08a';
const HAIR = '#2b2a28';
const JACKET = '#7a5a44';
const JEANS = '#3f5f8f';
const TRACK = '#1d1d1f';
const RED = '#ff3b30';
const SHOE = '#5a3d2b';
const SNEAKER = '#f4f3f0';
const INK = '#131313';

/** Where he stands, and the door (in the porthole's 100 × 100 box). */
const SPOT = 62;
const DOOR = { x: 12, w: 22, top: 34, bottom: 76 };
const AT_DOOR = DOOR.x + DOOR.w / 2 - SPOT;

export function PortholePerson({ outfit, transition = 'walk' }: { outfit: Outfit; transition?: OutfitTransition }) {
  // the outfit on him now, and where he is in a change
  const [worn, setWorn] = useState<Outfit>(outfit);
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wornRef = useRef<Outfit>(outfit);

  useEffect(() => {
    if (outfit === wornRef.current) return;
    wornRef.current = outfit;
    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    if (transition === 'cut') {
      later(0, () => {
        setWorn(outfit);
        setPhase('idle');
      });
    } else {
      // out through the door, change, back to his spot
      later(0, () => setPhase('out'));
      later(PERSON_WALK_MS + 120, () => {
        setWorn(outfit);
        setPhase('in');
      });
      later(2 * PERSON_WALK_MS + 200, () => setPhase('idle'));
    }
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      timers.current = [];
    };
  }, [outfit, transition]);

  const pants = worn === 0 ? JEANS : TRACK;
  const top = worn >= 2 ? RED : JACKET;
  const shoe = worn >= 3 ? SNEAKER : SHOE;
  const cheer = worn >= 3 && phase === 'idle';

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="absolute inset-0 h-full w-full" data-phase={phase}>
      {/* the room: wall, floor, the door (open while he goes through it) */}
      <rect width={100} height={100} fill="#d9d3c7" />
      <rect y={DOOR.bottom} width={100} height={100 - DOOR.bottom} fill="#b7ad9d" />
      <rect x={DOOR.x - 1.2} y={DOOR.top - 1.2} width={DOOR.w + 2.4} height={DOOR.bottom - DOOR.top + 1.2} fill="#6f6354" />
      <rect x={DOOR.x} y={DOOR.top} width={DOOR.w} height={DOOR.bottom - DOOR.top} fill="#3a332b" />
      <g className="asm-pp-door" style={{ transformOrigin: `${DOOR.x}px ${DOOR.top}px` }}>
        <rect x={DOOR.x} y={DOOR.top} width={DOOR.w} height={DOOR.bottom - DOOR.top} fill="#8d7f6c" stroke="#6f6354" strokeWidth={0.8} />
        <circle cx={DOOR.x + DOOR.w * 0.8} cy={(DOOR.top + DOOR.bottom) / 2 + 2} r={1.3} fill="#f2c230" />
      </g>
      {/* him: walks to the door (facing it) and back */}
      <g className="asm-pp-walker" style={{ ['--pp-door' as string]: `${AT_DOOR}px` }}>
        <g transform={`translate(${SPOT} 90)`}>
          <g className="asm-pp-face">
            <g className="asm-pp-breathe">
              {/* legs (sports trousers: a white stripe down the side) */}
              <g className="asm-pp-leg asm-pp-leg-a">
                <rect x={-6.5} y={-27} width={5.5} height={26} rx={2} fill={pants} />
                {worn >= 1 && <path d="M-6 -25.5V-2" stroke="#f4f3f0" strokeWidth={0.9} opacity={0.85} />}
                <rect x={-8} y={-3} width={7.5} height={3.6} rx={1.6} fill={shoe} stroke={worn >= 3 ? INK : 'none'} strokeWidth={0.5} />
              </g>
              <g className="asm-pp-leg asm-pp-leg-b">
                <rect x={1} y={-27} width={5.5} height={26} rx={2} fill={pants} />
                {worn >= 1 && <path d="M6 -25.5V-2" stroke="#f4f3f0" strokeWidth={0.9} opacity={0.85} />}
                <rect x={0.5} y={-3} width={7.5} height={3.6} rx={1.6} fill={shoe} stroke={worn >= 3 ? INK : 'none'} strokeWidth={0.5} />
              </g>
              {/* body and arms */}
              <path d="M-7.5 -46 L-11 -29" stroke={top} strokeWidth={4.2} strokeLinecap="round" />
              <circle cx={-11.3} cy={-28} r={2.2} fill={SKIN} />
              <rect x={-8.5} y={-50} width={17} height={25} rx={5} fill={top} />
              {worn === 0 && <path d="M0 -49V-26" stroke="#5d4433" strokeWidth={0.8} />}
              {worn >= 2 && <path d="M-8.5 -38H8.5" stroke="#f4f3f0" strokeWidth={1.2} opacity={0.8} />}
              {cheer ? (
                <g className="asm-pp-cheer" style={{ transformOrigin: '7.5px -46px' }}>
                  <path d="M7.5 -46 L13 -61" stroke={top} strokeWidth={4.2} strokeLinecap="round" />
                  <circle cx={13.4} cy={-62.6} r={2.5} fill={SKIN} />
                </g>
              ) : (
                <>
                  <path d="M7.5 -46 L11 -29" stroke={top} strokeWidth={4.2} strokeLinecap="round" />
                  <circle cx={11.3} cy={-28} r={2.2} fill={SKIN} />
                </>
              )}
              {/* head */}
              <circle cx={0} cy={-57} r={6.5} fill={SKIN} />
              <path d="M-6.5 -58 Q-6 -65 0 -64.5 Q6 -65 6.5 -58 Q3.5 -61 0 -60.5 Q-3.5 -61 -6.5 -58Z" fill={HAIR} />
              {worn >= 3 && <path d="M-6.4 -59.6 Q0 -61.6 6.4 -59.6" stroke={RED} strokeWidth={1.6} fill="none" />}
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

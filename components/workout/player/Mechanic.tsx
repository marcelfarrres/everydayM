import type { CSSProperties, ReactNode } from 'react';

/*
 * The two little mechanics of the rests (white, ink line, a cap in the rest's blue): drawn once,
 * moved by whoever hosts them, the repair of a rest (RepairCrew) or the separation in the clouds
 * (Separation). Their parts are found by `data-part="<id>-<part>"`: face (scaleX: which way it
 * looks), back (the free arm), legL, legR, head, arm (with the hammer or the wrench).
 */

export const CREW_INK = '#131313';
export const CREW_BLUE = '#2f6bff';
/** a mechanic's box: about 1.2 times the body's thickness */
export const MECHANIC = { W: 22, H: 36 } as const;

const MW = MECHANIC.W;
const MH = MECHANIC.H;

/** One little mechanic: legs, body, head with its cap, two arms; the hammer or the wrench. */
export function Mechanic({ id, tool }: { id: 'a' | 'b'; tool: 'hammer' | 'wrench' }) {
  const part = (name: string, style: CSSProperties, svg: ReactNode, w: number, h: number) => (
    <div data-part={`${id}-${name}`} className="absolute" style={{ ...style, width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" fill="#fff" stroke={CREW_INK} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
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
        <svg width={11} height={13} viewBox="0 0 11 13" className="block overflow-visible" fill="#fff" stroke={CREW_INK} strokeWidth={1.3}>
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
          <path d="M0.9 4.8 C1.4 1.4 8.6 1.4 9.1 4.8 L11.6 5.3" fill={CREW_BLUE} stroke={CREW_INK} strokeWidth={1.1} />
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
              <rect x={-1.5} y={15.5} width={7} height={3.4} rx={0.8} fill={CREW_INK} stroke="none" />
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

/** A puff of smoke or dust, as the crew's. */
export const CrewPuff = () => (
  <svg viewBox="0 0 26 18" className="block h-full w-full overflow-visible" fill="#fff" stroke={CREW_INK} strokeWidth={1.4} strokeLinejoin="round">
    <path d="M5 15 A4.5 4.5 0 0 1 4.5 6.4 A6 6 0 0 1 15.5 4.2 A5 5 0 0 1 22.6 9.6 A3.8 3.8 0 0 1 20.5 15 Z" />
  </svg>
);

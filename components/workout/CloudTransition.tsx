'use client';

import { useEffect, useRef } from 'react';
import { stagger, useAnimate, useReducedMotion } from 'motion/react';

/*
 * When an exercise ends and the rest begins, the screen fills with real clouds that close in
 * from both sides and then part outwards (like searching for a village in Clash of Clans).
 * Inside them a real rocket (NASA photo, sky removed) flies up and stops at the height of the
 * routine you have done; the words sit next to its nose. Then it blasts off as the clouds open.
 * Clouds: Unsplash photos with the sky keyed out (/textures/nube-1..4.webp).
 *
 * Timing, from the moment `playKey` changes:
 *   0.0-1.1 s  the banks drift in one after another (the old exercise is still underneath)
 *   0.3-1.7 s  the rocket flies in from below and settles; the words appear by its nose
 *   1.1-2.6 s  everything holds; the rest screen mounts behind
 *   2.6-4.2 s  the rocket shoots off the top while the banks open outwards
 */

export type Journey = {
  progress: number; // 0..1, where the routine is now
  total: string; // "20 min"
  note?: string; // "Llevas 8 de 20 min"
  marks: { at: number; label: string }[]; // where each section starts (0..1)
};

type Layer = { src: string; side: 'l' | 'r' | 't' | 'b'; top: string; left: string; flip?: boolean; z: number };

// Sized from the larger of the screen's width and height, so phones (tall) and computers (wide)
// are both fully covered when the two banks meet.
const LAYERS: Layer[] = [
  { src: '/textures/nube-2.webp', side: 'l', top: '-12%', left: '-38%', z: 1 },
  { src: '/textures/nube-4.webp', side: 'l', top: '30%', left: '-30%', z: 3 },
  { src: '/textures/nube-1.webp', side: 'l', top: '62%', left: '-42%', z: 2 },
  { src: '/textures/nube-3.webp', side: 'r', top: '-6%', left: '30%', flip: true, z: 2 },
  { src: '/textures/nube-2.webp', side: 'r', top: '34%', left: '38%', flip: true, z: 1 },
  { src: '/textures/nube-4.webp', side: 'r', top: '66%', left: '26%', flip: true, z: 3 },
  // two banks rolling in from above and below seal the middle
  { src: '/textures/nube-3.webp', side: 't', top: '-28%', left: '-20%', z: 4 },
  { src: '/textures/nube-2.webp', side: 'b', top: '48%', left: '-12%', flip: true, z: 5 },
  // a puffy core from each side, so the closed wall is dense and bright
  { src: '/textures/nube-1.webp', side: 'l', top: '18%', left: '-14%', z: 6 },
  { src: '/textures/nube-1.webp', side: 'r', top: '40%', left: '8%', flip: true, z: 6 },
];
const CLOSE = { duration: 0.8, ease: [0.4, 0, 0.2, 1] } as const;
const OPEN = { duration: 1.6, ease: [0.22, 1, 0.36, 1] } as const;
const OFF: Record<Layer['side'], string> = {
  l: 'translateX(-120%) scale(1.45)',
  r: 'translateX(120%) scale(1.45)',
  t: 'translateY(-120%) scale(1.45)',
  b: 'translateY(120%) scale(1.45)',
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// The rail runs from 66% (start) to 22% (done) of the screen height: even at the start most of
// the rocket is on screen.
const railY = (p: number) => `${(66 - Math.min(1, Math.max(0, p)) * 44).toFixed(2)}%`;
const INK = '#1d2533';

export function CloudTransition({
  playKey,
  title,
  sub,
  kicker,
  color = '#131313',
  journey,
}: {
  playKey: number;
  title?: string;
  sub?: string;
  kicker?: string;
  color?: string;
  journey?: Journey;
}) {
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  // plays only when the key really changes (not on mount, not when other deps settle)
  const lastKey = useRef(playKey);
  const run = useRef(0);
  const progress = journey?.progress ?? 0.5;
  const current = journey?.marks.filter((m) => m.at <= progress + 0.001).at(-1);

  useEffect(() => {
    if (lastKey.current === playKey) return;
    lastKey.current = playKey;
    if (reduced) return;
    const id = ++run.current;
    const play = async () => {
      animate('.cl-rocket', { y: '85vh' }, { duration: 0 });
      animate('.cl-words', { opacity: 0, y: 12 }, { duration: 0 });
      animate(scope.current, { visibility: 'visible' }, { duration: 0 });
      // the rocket flies in from below and parks at the height of the routine done
      animate('.cl-flight', { opacity: 1 }, { duration: 0.4, delay: 0.3 });
      animate('.cl-rocket', { y: 0 }, { duration: 1.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] });
      animate('.cl-words', { opacity: 1, y: 0 }, { duration: 0.5, delay: 0.9, ease: [0.22, 1, 0.36, 1] });
      await Promise.all([
        animate('.cl-l, .cl-r', { x: '0%', scale: 1, filter: 'blur(0px)' }, { ...CLOSE, delay: stagger(0.07) }),
        animate('.cl-t, .cl-b', { y: '0%', scale: 1, filter: 'blur(0px)' }, { ...CLOSE, delay: 0.12 }),
        animate('.cl-fog', { opacity: 1 }, { duration: 0.5, delay: 0.3 }),
      ]);
      if (id !== run.current) return;
      // while closed, the clouds keep drifting a little
      animate('.cl-l', { x: '4%' }, { duration: 2.4, ease: 'linear' });
      animate('.cl-r', { x: '-4%' }, { duration: 2.4, ease: 'linear' });
      await wait(1500);
      if (id !== run.current) return;
      // lift-off: the words go, the rocket shoots off the top, the clouds part
      animate('.cl-words', { opacity: 0, y: -8 }, { duration: 0.25 });
      animate('.cl-rocket', { y: '-120vh' }, { duration: 1.1, ease: [0.55, 0, 0.9, 0.45] });
      await wait(150);
      if (id !== run.current) return;
      await Promise.all([
        animate('.cl-l', { x: '-120%', scale: 1.2, filter: 'blur(2px)' }, { ...OPEN, delay: stagger(0.05) }),
        animate('.cl-r', { x: '120%', scale: 1.2, filter: 'blur(2px)' }, { ...OPEN, delay: stagger(0.05) }),
        animate('.cl-t', { y: '-120%', scale: 1.2, filter: 'blur(2px)' }, OPEN),
        animate('.cl-b', { y: '120%', scale: 1.2, filter: 'blur(2px)' }, OPEN),
        animate('.cl-fog', { opacity: 0 }, { duration: 0.9 }),
        animate('.cl-flight', { opacity: 0 }, { duration: 0.4, delay: 0.7 }),
      ]);
      if (id !== run.current) return;
      animate(scope.current, { visibility: 'hidden' }, { duration: 0 });
    };
    void play();
  }, [playKey, reduced, animate, scope]);

  return (
    <div ref={scope} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" style={{ visibility: 'hidden' }}>
      {/* soft white core, so no gap shows where the two banks meet */}
      <div
        className="cl-fog absolute inset-0 opacity-0"
        style={{ background: 'radial-gradient(80% 70% at 50% 55%, #ffffff 0%, #eef4fb 45%, #cfe0f3 80%, #b8d2ee 100%)' }}
      />
      {LAYERS.map((layer, i) => (
        <div
          key={i}
          className={`absolute cl-${layer.side}`}
          style={{
            top: layer.top,
            left: layer.left,
            width: 'max(115vw, 165vh)',
            zIndex: layer.z,
            transform: OFF[layer.side],
            // soft oval edge: no straight line where a photo ends
            maskImage: 'radial-gradient(50% 50% at 50% 50%, black 58%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(50% 50% at 50% 50%, black 58%, transparent 100%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative layers, preloaded once */}
          <img src={layer.src} alt="" draggable={false} className={`block w-full select-none ${layer.flip ? '-scale-x-100' : ''}`} />
        </div>
      ))}

      {/* THE FLIGHT: a faint rail with the routine, the rocket on it, the words by its nose */}
      <div className="cl-flight absolute inset-0 z-[8] opacity-0">
        <div className="absolute left-[34%] top-0 h-full w-0 sm:left-[42%]">
          {journey && (
            <>
              <div className="absolute bottom-[26%] top-[18%] w-px bg-[#1d2533]/15" />
              <p className="absolute right-3 top-[18%] -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1d2533]/55">
                {journey.total}
              </p>
              {journey.marks.map((mark) => (
                <p
                  key={mark.label}
                  className="absolute right-3 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] uppercase tracking-[0.12em]"
                  style={{ top: railY(mark.at), color: INK, opacity: mark === current ? 0.8 : 0.4, fontWeight: mark === current ? 600 : 400 }}
                >
                  <span className="hidden sm:inline">{mark.label}</span>
                  <span className="h-px w-[9px] translate-x-[12px] bg-current" />
                </p>
              ))}
            </>
          )}
          {/* the rocket: its nose is where you are */}
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative cutout */}
          <img
            src="/textures/cohete.webp"
            alt=""
            draggable={false}
            className="cl-rocket absolute h-[min(58vh,36rem)] w-auto max-w-none -translate-x-1/2 select-none [filter:drop-shadow(0_6px_14px_rgba(29,37,51,0.35))]"
            style={{ top: railY(progress) }}
          />
          {/* the words, beside the nose */}
          <div
            className="cl-words absolute left-10 w-[calc(66vw-3.5rem)] opacity-0 sm:left-14 sm:w-[min(50vw,24rem)]"
            style={{ top: `calc(${railY(progress)} - 0.75rem)` }}
          >
            {kicker && (
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#1d2533] backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {kicker}
              </p>
            )}
            {title && (
              <p className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,7vw,4.25rem)] font-semibold leading-[1] tracking-[-0.035em] text-[#1d2533] [text-shadow:0_2px_30px_rgba(255,255,255,0.95)]">
                {title}
              </p>
            )}
            {sub && <p className="mt-2 font-[family-name:var(--font-display)] text-lg font-medium text-[#3d4a60]">{sub}</p>}
            {journey?.note && (
              <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#1d2533]/60">
                {current ? `${current.label} · ` : ''}
                {journey.note}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

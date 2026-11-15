'use client';

import { useEffect, useRef } from 'react';
import { stagger, useAnimate, useReducedMotion } from 'motion/react';

/*
 * Between exercises the screen fills with real clouds that close in from both sides and then
 * part outwards, as if flying through them (like searching for a village in Clash of Clans).
 * The clouds are photos (Unsplash) with the sky keyed out: /textures/nube-1..4.webp.
 *
 * Timing, from the moment `playKey` changes:
 *   0.0-0.8 s  the banks drift in one after another (the old exercise is still underneath)
 *   0.8-1.5 s  closed and slowly drifting: the label shows; the new exercise mounts behind
 *   1.5-3.1 s  the banks open outwards, a gentle push-in, almost no blur
 *
 * While closed, a real rocket (NASA photo, sky removed) climbs a faint rail on the right from
 * where the routine was to where it is now: the whole routine, its sections, the one you're in.
 */

export type Journey = {
  progress: number; // 0..1, where the routine is when this transition plays
  total: string; // "20 min", at the top of the rail
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
// Slow and soft: the banks drift in one after another, rest a moment, then open like a camera
// flying through (no hard push, very little blur).
const CLOSE = { duration: 0.8, ease: [0.4, 0, 0.2, 1] } as const;
const OPEN = { duration: 1.6, ease: [0.22, 1, 0.36, 1] } as const;
const OFF: Record<Layer['side'], string> = {
  l: 'translateX(-120%) scale(1.45)',
  r: 'translateX(120%) scale(1.45)',
  t: 'translateY(-120%) scale(1.45)',
  b: 'translateY(120%) scale(1.45)',
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const first = useRef(true);
  const run = useRef(0);
  // where the rocket was last time: it climbs from there
  const to = journey?.progress ?? 0;
  const from = useRef(to);
  const current = journey?.marks.filter((m) => m.at <= to + 0.001).at(-1);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const start = from.current;
    const end = to;
    from.current = end;
    if (reduced) return;
    const id = ++run.current;
    const rail = (p: number) => `${((1 - p) * 100).toFixed(2)}%`;
    const play = async () => {
      animate('.cl-rocket', { top: rail(start) }, { duration: 0 });
      animate(scope.current, { visibility: 'visible' }, { duration: 0 });
      await Promise.all([
        animate('.cl-l, .cl-r', { x: '0%', scale: 1, filter: 'blur(0px)' }, { ...CLOSE, delay: stagger(0.07) }),
        animate('.cl-t, .cl-b', { y: '0%', scale: 1, filter: 'blur(0px)' }, { ...CLOSE, delay: 0.12 }),
        animate('.cl-fog', { opacity: 1 }, { duration: 0.5, delay: 0.3 }),
      ]);
      if (id !== run.current) return;
      // while closed, everything keeps moving a little, like real clouds
      animate('.cl-l', { x: '4%' }, { duration: 2, ease: 'linear' });
      animate('.cl-r', { x: '-4%' }, { duration: 2, ease: 'linear' });
      animate('.cl-journey', { opacity: 1 }, { duration: 0.5 });
      // lift-off: slow at first, then it pulls away and settles
      animate('.cl-rocket', { top: rail(end) }, { duration: 1.5, ease: [0.55, 0, 0.25, 1], delay: 0.15 });
      await animate('.cl-label', { opacity: 1, y: 0 }, { duration: 0.45, ease: [0.22, 1, 0.36, 1] });
      await wait(750);
      if (id !== run.current) return;
      await animate('.cl-label', { opacity: 0, y: -6 }, { duration: 0.3 });
      if (id !== run.current) return;
      await Promise.all([
        animate('.cl-l', { x: '-120%', scale: 1.2, filter: 'blur(2px)' }, { ...OPEN, delay: stagger(0.05) }),
        animate('.cl-r', { x: '120%', scale: 1.2, filter: 'blur(2px)' }, { ...OPEN, delay: stagger(0.05) }),
        animate('.cl-t', { y: '-120%', scale: 1.2, filter: 'blur(2px)' }, OPEN),
        animate('.cl-b', { y: '120%', scale: 1.2, filter: 'blur(2px)' }, OPEN),
        animate('.cl-fog', { opacity: 0 }, { duration: 0.9 }),
        animate('.cl-journey', { opacity: 0 }, { duration: 0.35 }),
      ]);
      if (id !== run.current) return;
      animate(scope.current, { visibility: 'hidden' }, { duration: 0 });
      animate('.cl-label', { y: 12 }, { duration: 0 });
    };
    void play();
    // plays when the exercise changes (playKey); `to` changes with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {journey && (
        <div className="cl-journey absolute bottom-[14%] right-[max(1.25rem,4vw)] top-[16%] z-[8] w-px opacity-0">
          {/* the rail: the whole routine, bottom to top */}
          <div className="absolute inset-0 bg-[#1d2533]/15" />
          {/* phone: the section you're in goes up here, next to the total, clear of the big words */}
          <p className="absolute -top-7 right-[-0.5rem] whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1d2533]/55">
            {current && <span className="sm:hidden">{current.label} · </span>}
            {journey.total}
          </p>
          <span className="absolute -left-[5px] top-0 h-px w-[11px] bg-[#1d2533]/40" />
          {journey.marks.map((mark) => {
            const now = current === mark;
            return (
              <div key={mark.label} className="absolute right-0 flex translate-y-1/2 items-center gap-2" style={{ bottom: `${mark.at * 100}%` }}>
                <span className={`hidden whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-[#1d2533] sm:inline ${now ? 'font-semibold opacity-75' : 'opacity-35'}`}>{mark.label}</span>
                <span className={`h-px w-[9px] translate-x-[4px] ${now ? 'bg-[#1d2533]/60' : 'bg-[#1d2533]/30'}`} />
              </div>
            );
          })}
          {/* the rocket: its nose marks where you are */}
          {/* eslint-disable-next-line @next/next/no-img-element -- small decorative cutout */}
          <img
            src="/textures/cohete.webp"
            alt=""
            draggable={false}
            className="cl-rocket absolute left-1/2 h-[clamp(8.5rem,20vh,12rem)] w-auto max-w-none -translate-x-1/2 select-none opacity-90 [filter:drop-shadow(0_2px_6px_rgba(29,37,51,0.35))]"
            style={{ top: '100%' }}
          />
        </div>
      )}
      {/* the words sit on the clouds in the app's own type: phase, then where you are going */}
      <div className="cl-label absolute inset-0 z-10 flex flex-col items-center justify-center px-8 text-center opacity-0" style={{ transform: 'translateY(12px)' }}>
        {kicker && (
          <p className="mb-3 flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#1d2533] backdrop-blur-sm">
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
      </div>
    </div>
  );
}

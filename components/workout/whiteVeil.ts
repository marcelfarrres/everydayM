import { FINALE } from '@/components/workout/assembly';
import { TRAIL, VEIL_WORDS, trailProgressAt, trailPuffs, trailShape } from '@/components/workout/veilTrail';

/*
 * The white the rocket's smoke leaves (creator → player, phone): «A ponerse como un cohete» (and,
 * with a warm-up, «pero antes toca calentar.») big on the smoke: soft puffs with a light grey shade
 * along their edges, a faint exhaust trail rising through the middle to a small rocket far up near
 * the top (nothing behind the words: a white glow keeps them clear). The words are held 2 s once
 * they are in (the page times it: veilHandOffMs), then the smoke leaves like a rocket's trail
 * fading from the launch pad up: it clears from the bottom first, the cleared edge rises, what is
 * left narrows into a trail of soft uneven puffs tapering up to the rocket, and the last of it
 * fades at the top (veilTrail.ts: one mask on the smoke). The words fade before the edge reaches
 * them. The workout is already on screen under it, so it shows from the bottom up.
 *
 * It lives in <body>, outside React, so it survives the creator going away (React would take it
 * with it, and the old page would flash). Reduced motion: nothing moving, a plain cross-fade.
 */

const TEXT = 'text-[clamp(2.4rem,12.6vw,3.7rem)] font-semibold leading-[1] tracking-[-0.035em]';
const SUB = 'mt-5 text-[clamp(1.35rem,6.4vw,2rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-ink/70';
/** A puff: white, its edge shaded light grey. */
const PUFF = 'radial-gradient(circle at 42% 38%, #ffffff 56%, #f1f0ec 76%, #e2e0da 100%)';
/** A puff of the leaving mask: fully there within 60 % of its radius, fading to nothing at its edge. */
const MASK_PUFF = 'radial-gradient(closest-side, #000 60%, transparent 100%)';
/** The leaving smoke's frames (the easing is in trailShape: the frames are linear between). */
const FRAMES = 24;

/**
 * The puffs, as [x share of the width, y share of the height, radius in px]. The first ones sit on
 * the smoke's top edge (a soft scalloped edge); the rest frame the screen's lower corners and
 * sides, well away from the words in the middle.
 */
const PUFFS: [number, number, number][] = [
  [0.02, 0, 80],
  [0.24, -0.01, 95],
  [0.5, 0.005, 88],
  [0.76, -0.01, 100],
  [0.98, 0, 84],
  [-0.06, 0.62, 90],
  [1.07, 0.5, 96],
  [0.08, 0.98, 120],
  [0.42, 1.05, 130],
  [0.86, 0.99, 125],
];

export interface Veil {
  /** the workout is on screen: the smoke clears away (a plain cross-fade with reduced motion) and goes */
  release: () => void;
}

/** How long the smoke takes to clear and uncover the workout, ms (also FINALE.veilFadeMs). */
export const VEIL_LEAVE_MS = FINALE.veilFadeMs;

function el(tag: string, className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node.style, style);
  return node;
}

/** The leaving mask at `p` on a `W`×`H` screen: its images, sizes and positions (one layer per puff, and the solid middle). */
function maskAt(p: number, W: number, H: number) {
  const { puffs, core } = trailPuffs(p, W, H);
  const px = (v: number) => `${v.toFixed(1)}px`;
  return {
    image: ['linear-gradient(#000, #000)', ...puffs.map(() => MASK_PUFF)].join(', '),
    size: [`${px(core.w)} ${px(core.h)}`, ...puffs.map((q) => `${px(2 * q.r)} ${px(2 * q.r)}`)].join(', '),
    position: [`${px(core.x)} ${px(core.y)}`, ...puffs.map((q) => `${px(q.x - q.r)} ${px(q.y - q.r)}`)].join(', '),
  };
}

/** Covers the screen in the rocket's smoke with the sentence (`warmup`: and that the warm-up comes first). */
export function openVeil({ warmup, reduced }: { warmup: boolean; reduced: boolean }): Veil {
  if (typeof document === 'undefined') return { release: () => {} };
  const veil = el('div', 'pointer-events-none fixed inset-0 z-[90] overflow-hidden font-[family-name:var(--font-display)] text-ink');
  veil.setAttribute('role', 'status');

  // the smoke: all white, its puffs, the exhaust trail up the middle to a small rocket near the
  // top (faint); it leaves as one piece
  const smoke = el('div', 'absolute inset-0 bg-white');
  smoke.setAttribute('data-veil-smoke', '');
  for (const [x, y, r] of PUFFS) {
    smoke.append(el('span', 'absolute rounded-full', { left: `calc(${x * 100}% - ${r}px)`, top: `calc(${y * 100}% - ${r}px)`, width: `${2 * r}px`, height: `${2 * r}px`, background: PUFF }));
  }
  const ns = 'http://www.w3.org/2000/svg';
  const trail = document.createElementNS(ns, 'svg');
  trail.setAttribute('viewBox', '0 0 100 100');
  trail.setAttribute('preserveAspectRatio', 'none');
  trail.setAttribute('aria-hidden', 'true');
  trail.setAttribute('class', 'absolute inset-0 h-full w-full');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M50 104 C46 82 54 66 49 48 C45 33 53 22 50 13.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#e3e1db');
  path.setAttribute('stroke-width', '16');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  trail.append(path);
  smoke.append(trail);
  const rocket = document.createElementNS(ns, 'svg');
  rocket.setAttribute('viewBox', '-10 -20 20 40');
  rocket.setAttribute('aria-hidden', 'true');
  rocket.setAttribute('class', 'absolute left-1/2 top-[7%] h-9 w-[18px] -translate-x-1/2');
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M0 -19 C5 -13 6 -4 5 10 L9 16 L9 19 L3 16 L-3 16 L-9 19 L-9 16 L-5 10 C-6 -4 -5 -13 0 -19 Z');
  body.setAttribute('fill', '#131313');
  body.setAttribute('opacity', '0.22');
  rocket.append(body);
  smoke.append(rocket);
  veil.append(smoke);

  // the words, on a soft white glow (the trail never shows behind them)
  const words = el('div', 'absolute inset-0 flex flex-col items-center justify-center px-6 text-center');
  words.setAttribute('data-veil-words', '');
  const block = el('div', 'relative px-8 py-12', { background: 'radial-gradient(closest-side, #ffffff 64%, rgba(255,255,255,0) 100%)' });
  const line = el('p', TEXT);
  line.append('A ponerse', document.createElement('br'), 'como un', document.createElement('br'));
  const red = el('span', 'text-heat');
  red.textContent = 'cohete';
  line.append(red);
  block.append(line);
  if (warmup) {
    const sub = el('p', SUB);
    sub.textContent = 'pero antes toca calentar.';
    block.append(sub);
  }
  words.append(block);
  veil.append(words);
  document.body.append(veil);

  if (!reduced) {
    Array.from(block.children).forEach((child, i) =>
      child.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
        duration: VEIL_WORDS.inMs,
        delay: VEIL_WORDS.delayMs + i * VEIL_WORDS.staggerMs,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'backwards',
      }),
    );
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      // a moment for the player to paint under it (timers, not frames: they also run in a hidden tab)
      setTimeout(() => {
        if (reduced) {
          veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: VEIL_LEAVE_MS, easing: 'ease-in-out', fill: 'forwards' });
        } else {
          const W = veil.clientWidth || window.innerWidth;
          const H = veil.clientHeight || window.innerHeight;
          // (unprefixed masks where they exist, else the -webkit- ones)
          const plain = typeof CSS !== 'undefined' && CSS.supports('mask-image', 'linear-gradient(#000, #000)');
          const size = plain ? 'maskSize' : 'webkitMaskSize';
          const position = plain ? 'maskPosition' : 'webkitMaskPosition';
          const first = maskAt(0, W, H);
          // (its first frame, set as it is: all white, whether or not the animation runs)
          const s = smoke.style;
          s.setProperty(plain ? 'mask-image' : '-webkit-mask-image', first.image);
          s.setProperty(plain ? 'mask-repeat' : '-webkit-mask-repeat', 'no-repeat');
          s.setProperty(plain ? 'mask-size' : '-webkit-mask-size', first.size);
          s.setProperty(plain ? 'mask-position' : '-webkit-mask-position', first.position);
          const frames: Keyframe[] = [];
          for (let k = 0; k <= FRAMES; k++) {
            const p = k / FRAMES;
            const m = maskAt(p, W, H);
            frames.push({ offset: p, [size]: m.size, [position]: m.position, opacity: trailShape(p).opacity });
          }
          smoke.animate(frames, { duration: VEIL_LEAVE_MS, easing: 'linear', fill: 'forwards' });
          // the words are gone before the rising edge reaches them (read once, before it moves)
          const bottom = block.getBoundingClientRect().bottom / H;
          const goneBy = Math.max(0.12, trailProgressAt(Math.min(TRAIL.startEdge, bottom + 0.04)));
          words.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.round(VEIL_LEAVE_MS * goneBy), easing: 'ease-out', fill: 'forwards' });
        }
        setTimeout(() => veil.remove(), VEIL_LEAVE_MS + 60);
      }, VEIL_WORDS.leaveDelayMs);
    },
  };
}

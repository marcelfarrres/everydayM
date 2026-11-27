import { FINALE } from '@/components/workout/assembly';

/*
 * The white the rocket's smoke leaves (creator → player, phone): «A ponerse como un cohete» (and,
 * with a warm-up, «pero antes toca calentar.») big on the smoke: soft puffs with a light grey shade
 * along their edges, a faint exhaust trail rising through the middle to a small rocket far up near
 * the top (nothing behind the words: a white glow keeps them clear). It is held until the words
 * have been read, then the smoke LEAVES DOWNWARDS: it sinks out through the bottom edge, uncovering
 * the workout (already on screen under it) from the top down, while the words fade.
 *
 * It lives in <body>, outside React, so it survives the creator going away (React would take it
 * with it, and the old page would flash). Reduced motion: no puffs moving, a plain cross-fade.
 */

const TEXT = 'text-[clamp(2.4rem,12.6vw,3.7rem)] font-semibold leading-[1] tracking-[-0.035em]';
const SUB = 'mt-5 text-[clamp(1.35rem,6.4vw,2rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-ink/70';
/** A puff: white, its edge shaded light grey. */
const PUFF = 'radial-gradient(circle at 42% 38%, #ffffff 56%, #f1f0ec 76%, #e2e0da 100%)';

/**
 * The puffs, as [x share of the width, y share of the height, radius in px]. The first ones sit on
 * the smoke's top edge (seen as it sinks: a soft scalloped edge); the rest frame the screen's lower
 * corners and sides, well away from the words in the middle.
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
  /** the workout is on screen: the smoke sinks away (a plain cross-fade with reduced motion) and goes */
  release: () => void;
}

/** How long the smoke takes to sink away and uncover the workout, ms (also FINALE.veilFadeMs). */
export const VEIL_LEAVE_MS = FINALE.veilFadeMs;

function el(tag: string, className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node.style, style);
  return node;
}

/** Covers the screen in the rocket's smoke with the sentence (`warmup`: and that the warm-up comes first). */
export function openVeil({ warmup, reduced }: { warmup: boolean; reduced: boolean }): Veil {
  if (typeof document === 'undefined') return { release: () => {} };
  const veil = el('div', 'pointer-events-none fixed inset-0 z-[90] overflow-hidden font-[family-name:var(--font-display)] text-ink');
  veil.setAttribute('role', 'status');

  // the smoke: all white, its puffs (it sinks away as one piece)
  const smoke = el('div', 'absolute inset-0 bg-white');
  for (const [x, y, r] of PUFFS) {
    smoke.append(el('span', 'absolute rounded-full', { left: `calc(${x * 100}% - ${r}px)`, top: `calc(${y * 100}% - ${r}px)`, width: `${2 * r}px`, height: `${2 * r}px`, background: PUFF }));
  }
  veil.append(smoke);

  // the exhaust trail up the middle to a small rocket near the top (faint), and the words
  const air = el('div', 'absolute inset-0');
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
  air.append(trail);
  const rocket = document.createElementNS(ns, 'svg');
  rocket.setAttribute('viewBox', '-10 -20 20 40');
  rocket.setAttribute('aria-hidden', 'true');
  rocket.setAttribute('class', 'absolute left-1/2 top-[7%] h-9 w-[18px] -translate-x-1/2');
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M0 -19 C5 -13 6 -4 5 10 L9 16 L9 19 L3 16 L-3 16 L-9 19 L-9 16 L-5 10 C-6 -4 -5 -13 0 -19 Z');
  body.setAttribute('fill', '#131313');
  body.setAttribute('opacity', '0.22');
  rocket.append(body);
  air.append(rocket);

  // the words, on a soft white glow (the trail never shows behind them)
  const words = el('div', 'absolute inset-0 flex flex-col items-center justify-center px-6 text-center');
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
  air.append(words);
  veil.append(air);
  document.body.append(veil);

  if (!reduced) {
    Array.from(block.children).forEach((child, i) =>
      child.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 80 + i * 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }),
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
          // the smoke sinks out through the bottom edge (its scalloped top edge last), the words fade
          smoke.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(calc(100% + 120px))' }], { duration: VEIL_LEAVE_MS, easing: 'cubic-bezier(0.55, 0, 0.7, 0.4)', fill: 'forwards' });
          air.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.round(VEIL_LEAVE_MS * 0.45), easing: 'ease-out', fill: 'forwards' });
        }
        setTimeout(() => veil.remove(), VEIL_LEAVE_MS + 60);
      }, 60);
    },
  };
}

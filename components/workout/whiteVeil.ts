import { FINALE } from '@/components/workout/assembly';
import { VEIL_WORDS, arrivalCoveredAt, arrivalPuffs, trailPuffs, trailShape, type Puff } from '@/components/workout/veilTrail';

/*
 * The white the rocket's smoke leaves (creator → player, phone): «A ponerse como un cohete» (and,
 * with a warm-up, «pero antes toca calentar.») big on the smoke: soft puffs with a light grey shade
 * along their edges, a faint exhaust trail rising through the middle to a small rocket far up near
 * the top (nothing behind the words: a white glow keeps them clear). All of it is ONE layer, shown
 * through one mask (veilTrail.ts): it arrives as the rocket's smoke spreading up from the pad, the
 * words and the rest uncovered as the soft front passes them; it is held 2 s once the words are
 * fully uncovered (the page times it: veilHandOffMs with `uncoveredMs`); then it leaves like a
 * rocket's trail fading from the pad up, the rising cleared edge taking the words with it. The
 * workout is already on screen under it, so it shows from the bottom up.
 *
 * It lives in <body>, outside React, so it survives the creator going away (React would take it
 * with it, and the old page would flash). Reduced motion: nothing moving, a plain cross-fade.
 */

const TEXT = 'text-[clamp(2.4rem,12.6vw,3.7rem)] font-semibold leading-[1] tracking-[-0.035em]';
const SUB = 'mt-5 text-[clamp(1.35rem,6.4vw,2rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-ink/70';
/** A puff: white, its edge shaded light grey. */
const PUFF = 'radial-gradient(circle at 42% 38%, #ffffff 56%, #f1f0ec 76%, #e2e0da 100%)';
/** A puff of the mask: fully there within 60 % of its radius, fading to nothing at its edge. */
const MASK_PUFF = 'radial-gradient(closest-side, #000 60%, transparent 100%)';
/** The mask's frames, arriving and leaving (the easing is in the shapes: linear between frames). */
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
  /** when it opened (performance time), and how long after that the words are fully uncovered, ms */
  openedAt: number;
  uncoveredMs: number;
}

/** How long the white takes to arrive (the finale's smoke), and to clear and uncover the workout, ms. */
export const VEIL_ARRIVE_MS = FINALE.smokeMs;
export const VEIL_LEAVE_MS = FINALE.veilFadeMs;

function el(tag: string, className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node.style, style);
  return node;
}

type MaskShape = { puffs: Puff[]; core: { x: number; y: number; w: number; h: number } };

/** A mask shape as CSS: its images, sizes and positions (one layer per puff, and the solid part). */
function maskCss({ puffs, core }: MaskShape) {
  const px = (v: number) => `${v.toFixed(1)}px`;
  return {
    image: ['linear-gradient(#000, #000)', ...puffs.map(() => MASK_PUFF)].join(', '),
    size: [`${px(core.w)} ${px(core.h)}`, ...puffs.map((q) => `${px(2 * q.r)} ${px(2 * q.r)}`)].join(', '),
    position: [`${px(core.x)} ${px(core.y)}`, ...puffs.map((q) => `${px(q.x - q.r)} ${px(q.y - q.r)}`)].join(', '),
  };
}

/**
 * Covers the screen in the rocket's smoke with the sentence (`warmup`: and that the warm-up comes
 * first), spreading up from the pad at `originX` (px; the middle if not given).
 */
export function openVeil({ warmup, reduced, originX }: { warmup: boolean; reduced: boolean; originX?: number }): Veil {
  if (typeof document === 'undefined') return { release: () => {}, openedAt: 0, uncoveredMs: 0 };
  const veil = el('div', 'pointer-events-none fixed inset-0 z-[90] overflow-hidden font-[family-name:var(--font-display)] text-ink');
  veil.setAttribute('role', 'status');

  // the one layer: all white, its puffs, the exhaust trail up the middle to a small rocket near the
  // top (faint), and the words; it arrives and leaves as one piece, through one mask
  const layer = el('div', 'absolute inset-0 bg-white');
  layer.setAttribute('data-veil-smoke', '');
  for (const [x, y, r] of PUFFS) {
    layer.append(el('span', 'absolute rounded-full', { left: `calc(${x * 100}% - ${r}px)`, top: `calc(${y * 100}% - ${r}px)`, width: `${2 * r}px`, height: `${2 * r}px`, background: PUFF }));
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
  layer.append(trail);
  const rocket = document.createElementNS(ns, 'svg');
  rocket.setAttribute('viewBox', '-10 -20 20 40');
  rocket.setAttribute('aria-hidden', 'true');
  rocket.setAttribute('class', 'absolute left-1/2 top-[7%] h-9 w-[18px] -translate-x-1/2');
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M0 -19 C5 -13 6 -4 5 10 L9 16 L9 19 L3 16 L-3 16 L-9 19 L-9 16 L-5 10 C-6 -4 -5 -13 0 -19 Z');
  body.setAttribute('fill', '#131313');
  body.setAttribute('opacity', '0.22');
  rocket.append(body);
  layer.append(rocket);

  // the words, on a soft white glow (the trail never shows behind them); real text, announced once
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
  layer.append(words);
  veil.append(layer);
  document.body.append(veil);

  // (unprefixed masks where they exist, else the -webkit- ones)
  const plain = typeof CSS !== 'undefined' && CSS.supports('mask-image', 'linear-gradient(#000, #000)');
  const prop = (name: string) => (plain ? name : `-webkit-${name}`);
  const sizeKey = plain ? 'maskSize' : 'webkitMaskSize';
  const positionKey = plain ? 'maskPosition' : 'webkitMaskPosition';
  /** The layer through the mask `shapeAt` (0..1): its first frame set as it is, then played over `ms`. */
  const playMask = (shapeAt: (p: number) => MaskShape, ms: number, opacityAt: (p: number) => number = () => 1) => {
    const first = maskCss(shapeAt(0));
    layer.style.setProperty(prop('mask-image'), first.image);
    layer.style.setProperty(prop('mask-repeat'), 'no-repeat');
    layer.style.setProperty(prop('mask-size'), first.size);
    layer.style.setProperty(prop('mask-position'), first.position);
    const frames: Keyframe[] = [];
    for (let k = 0; k <= FRAMES; k++) {
      const p = k / FRAMES;
      const m = maskCss(shapeAt(p));
      frames.push({ offset: p, [sizeKey]: m.size, [positionKey]: m.position, opacity: opacityAt(p) });
    }
    return layer.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' });
  };
  const clearMask = () => ['mask-image', 'mask-repeat', 'mask-size', 'mask-position'].forEach((name) => layer.style.removeProperty(prop(name)));

  // it arrives: the smoke spreading up from the pad uncovers it (the words' box read once, now)
  const openedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  let uncoveredMs = 0;
  let arriving: Animation | null = null;
  if (!reduced) {
    const W = veil.clientWidth || window.innerWidth;
    const H = veil.clientHeight || window.innerHeight;
    const origin = originX ?? W / 2;
    const rects = Array.from(block.children).map((c) => c.getBoundingClientRect());
    const box = {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
    uncoveredMs = Math.round(arrivalCoveredAt(box, W, H, origin) * VEIL_ARRIVE_MS);
    const anim = playMask((p) => arrivalPuffs(p, W, H, origin), VEIL_ARRIVE_MS);
    anim.onfinish = () => {
      // (all white now: no mask at all until it leaves)
      if (arriving !== anim) return;
      clearMask();
      anim.cancel();
      arriving = null;
    };
    arriving = anim;
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
          arriving?.cancel();
          arriving = null;
          // the trail fades from the pad up; whatever is on the cleared part goes with it, the words too
          playMask((p) => trailPuffs(p, W, H), VEIL_LEAVE_MS, (p) => trailShape(p).opacity);
        }
        setTimeout(() => veil.remove(), VEIL_LEAVE_MS + 60);
      }, VEIL_WORDS.leaveDelayMs);
    },
    openedAt,
    uncoveredMs,
  };
}

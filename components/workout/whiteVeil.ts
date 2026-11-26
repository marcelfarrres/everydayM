import { FINALE } from '@/components/workout/assembly';

/*
 * The white the rocket's smoke leaves (creator → player, phone): «A ponerse como un cohete» on an
 * all-white screen, kept above everything while the page changes from the creator to the player,
 * then dissolved into the player's first frame. It lives in <body>, outside React, so it survives
 * the creator going away (React would take it with it, and the old page would flash).
 */

const TEXT = 'text-[clamp(1.9rem,9.6vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.03em]';

export interface Veil {
  /** the workout is on screen: dissolve (a plain cut with reduced motion) and go */
  release: () => void;
}

/** Covers the screen in white with the sentence (`warmup`: and that the warm-up comes first). */
export function openVeil({ warmup, reduced }: { warmup: boolean; reduced: boolean }): Veil {
  if (typeof document === 'undefined') return { release: () => {} };
  const veil = document.createElement('div');
  veil.setAttribute('role', 'status');
  veil.className = 'fixed inset-0 z-[90] flex flex-col items-center justify-center bg-white px-8 text-center font-[family-name:var(--font-display)] text-ink';
  const line = document.createElement('p');
  line.className = TEXT;
  line.append('A ponerse', document.createElement('br'), 'como un', document.createElement('br'));
  const red = document.createElement('span');
  red.className = 'text-heat';
  red.textContent = 'cohete';
  line.append(red);
  veil.append(line);
  if (warmup) {
    const sub = document.createElement('p');
    sub.className = 'mt-5 text-[15px] font-medium text-ink/60';
    sub.textContent = 'Y empieza el calentamiento';
    veil.append(sub);
  }
  document.body.append(veil);
  if (!reduced) {
    Array.from(veil.children).forEach((child, i) =>
      child.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 80 + i * 140, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }),
    );
  }
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (reduced) {
        setTimeout(() => veil.remove(), 30);
        return;
      }
      // a moment for the player to paint under it (timers, not frames: they also run in a hidden tab)
      setTimeout(() => {
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FINALE.veilFadeMs, easing: 'ease-in-out', fill: 'forwards' });
        setTimeout(() => veil.remove(), FINALE.veilFadeMs + 40);
      }, 60);
    },
  };
}

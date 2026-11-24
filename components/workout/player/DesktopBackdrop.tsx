'use client';

import { motion } from 'motion/react';

/** Computer only: a real chalkboard behind everything, lit by a hanging bulb. */
export function DesktopBackdrop({ reduced }: { reduced: boolean }) {
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 hidden bg-[url(/textures/pizarra-negra.webp)] bg-cover bg-center lg:block" />
      <div aria-hidden="true" className="absolute inset-0 hidden bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(0,0,0,0.55))] lg:block" />
      {/* the bulb's light: a plain translucent glow (no blend mode), flickering now and then */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{ background: 'radial-gradient(42% 52% at 64% 0%, rgba(255,196,120,0.22), transparent 70%)' }}
        animate={reduced ? undefined : { opacity: [1, 1, 0.72, 1, 0.86, 1, 1] }}
        transition={{ duration: 7, times: [0, 0.6, 0.62, 0.64, 0.66, 0.68, 1], repeat: Infinity }}
      />
      <svg aria-hidden="true" width="64" height="118" viewBox="0 0 64 118" className="pointer-events-none absolute left-[64%] top-0 z-20 hidden -translate-x-1/2 lg:block">
        <line x1="32" y1="0" x2="32" y2="60" stroke="#0d0d0d" strokeWidth="3" />
        <rect x="23" y="58" width="18" height="14" rx="2" fill="#2b2b2b" />
        <circle cx="32" cy="94" r="34" fill="#ffb547" opacity="0.18" />
        <circle cx="32" cy="94" r="19" fill="#ffd796" />
        <path d="M25 96 q7 -14 14 0" stroke="#c97a1a" strokeWidth="2" fill="none" />
      </svg>
    </>
  );
}

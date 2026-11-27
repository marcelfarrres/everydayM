'use client';

import { Volume2 } from 'lucide-react';
import { unlockPlayerAudio } from '@/lib/audio/unlock';

/*
 * «Activar sonido» for the music: shown while the browser refuses to bring the music back
 * without a tap (the watchdog gave up, or play()/resume() was refused). Tapping it, or anywhere,
 * unlocks everything again. It sits where the talk's own «Activar sonido» goes and gives way to
 * it (that one also wakes the music), and the routine's percent steps aside for either.
 */
export function SoundRescue() {
  return (
    <button
      type="button"
      data-unmute=""
      onClick={() => unlockPlayerAudio({ startMusic: false })}
      className="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[rgb(14_14_14/0.6)] pl-3.5 pr-4 font-[family-name:var(--font-display)] text-[14px] font-semibold text-white transition-colors hover:bg-[rgb(14_14_14/0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white group-has-[[data-talk-unmute]]/player:hidden lg:left-8 lg:top-6"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      Activar sonido
    </button>
  );
}

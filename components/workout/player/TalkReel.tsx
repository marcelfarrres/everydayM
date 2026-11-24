'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { playbackUrl } from '@/lib/media';
import type { ExerciseTalk } from '@/types/workout';

/*
 * The talks of a long rest (Marcel to camera, with voice), full screen, one after another.
 * They start `delayMs` after mounting: when the clouds open, not underneath them.
 *
 * One <video> element plays every talk (only its src changes), so a tap that unlocks sound on
 * it keeps working for the next talk on iPhone. If the browser refuses to start it with sound,
 * it plays muted and shows one small "Activar sonido".
 *
 * Kept small on purpose: the audio engine (music ducking while a talk speaks) hooks in here.
 */
export function TalkReel({
  talks,
  delayMs,
  paused,
  onFinished,
}: {
  talks: ExerciseTalk[];
  delayMs: number;
  paused: boolean;
  onFinished: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(delayMs <= 0);
  const [muted, setMuted] = useState(false);
  const talk = talks[index];

  useEffect(() => {
    if (started) return;
    const t = setTimeout(() => setStarted(true), delayMs);
    return () => clearTimeout(t);
  }, [started, delayMs]);

  // Start (or resume) the current talk: with sound if the browser allows it, muted otherwise.
  useEffect(() => {
    const el = video.current;
    if (!el || !started || !talk) return;
    if (paused) {
      el.pause();
      return;
    }
    el.muted = muted;
    el.play().catch((err: unknown) => {
      // only a refusal to play with sound falls back to muted (not an interrupted load)
      if (el.muted || !(err instanceof DOMException) || err.name !== 'NotAllowedError') return;
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
  }, [started, paused, talk, muted]);

  const unmute = () => {
    const el = video.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    el.play().catch(() => {});
  };

  const next = () => {
    if (index + 1 < talks.length) setIndex(index + 1);
    else onFinished();
  };

  if (!talk) return null;

  return (
    <>
      <video
        ref={video}
        src={playbackUrl(talk)}
        poster={talk.poster_url ?? undefined}
        playsInline
        preload="auto"
        onEnded={next}
        onError={next}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {started && muted && (
        <button
          type="button"
          onClick={unmute}
          className="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 items-center gap-2 rounded-full bg-[rgb(14_14_14/0.6)] pl-3.5 pr-4 font-[family-name:var(--font-display)] text-[14px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:left-8 lg:top-6"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          Activar sonido
        </button>
      )}
    </>
  );
}

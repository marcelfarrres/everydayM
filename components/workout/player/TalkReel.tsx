'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { playbackUrl } from '@/lib/media';
import { attachTalkVideo, getTalkVideo, releaseTalkVideo, setTalkSource } from '@/lib/audio/talkVideo';
import { unlockPlayerAudio } from '@/lib/audio/unlock';
import type { ExerciseTalk } from '@/types/workout';

/*
 * The talks of a long rest (Marcel to camera, with voice), full screen, one after another.
 * They start `delayMs` after mounting: when the clouds open, not underneath them.
 *
 * The picture is the app's one shared talk element (lib/audio/talkVideo), unlocked in the
 * "Empezar" tap: this component only lends it a place on screen and changes its src. A new
 * <video> would be refused sound on iPhone. Its playback ducks the music by itself.
 * If the browser still refuses sound, the talk plays muted and one small "Activar sonido"
 * appears; tapping it unlocks everything (talk, music, the audio context).
 */

const FILL = 'absolute inset-0 h-full w-full object-cover';

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
  const host = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(delayMs <= 0);
  const [muted, setMuted] = useState(false);
  const talk = talks[index];

  // Borrow the shared element for as long as this rest shows talks.
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    attachTalkVideo(node, FILL);
    return () => releaseTalkVideo(node);
  }, []);

  useEffect(() => {
    if (started) return;
    const t = setTimeout(() => setStarted(true), delayMs);
    return () => clearTimeout(t);
  }, [started, delayMs]);

  const next = useEffectEvent(() => {
    if (index + 1 < talks.length) setIndex(index + 1);
    else onFinished();
  });

  // The element is shared, so its end and errors are listened to only while this reel holds it.
  useEffect(() => {
    const el = getTalkVideo();
    if (!el) return;
    const onDone = () => next();
    el.addEventListener('ended', onDone);
    el.addEventListener('error', onDone);
    return () => {
      el.removeEventListener('ended', onDone);
      el.removeEventListener('error', onDone);
    };
  }, []);

  // Start (or resume) the current talk: with sound if the browser allows it, muted otherwise.
  useEffect(() => {
    const el = getTalkVideo();
    if (!el || !talk) return;
    setTalkSource(el, playbackUrl(talk), talk.poster_url);
    if (!started) return;
    if (paused) {
      el.pause();
      return;
    }
    const start = () => {
      el.muted = muted;
      el.play().catch((err: unknown) => {
        // only a refusal to play with sound falls back to muted (not an interrupted load)
        if (el.muted || !(err instanceof DOMException) || err.name !== 'NotAllowedError') return;
        el.muted = true;
        setMuted(true);
        el.play().catch(() => {});
      });
    };
    start();
    // Back from a locked screen or another tab: carry on where it was.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && el.paused && !el.ended) start();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [started, paused, talk, muted]);

  const unmute = () => {
    unlockPlayerAudio({ startMusic: false }); // this tap also wakes the music if it was refused
    const el = getTalkVideo();
    if (!el) return;
    el.muted = false;
    setMuted(false);
    el.play().catch(() => {});
  };

  if (!talk) return null;

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {started && muted && (
        <button
          type="button"
          data-unmute=""
          onClick={unmute}
          className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[rgb(14_14_14/0.6)] pl-3.5 pr-4 font-[family-name:var(--font-display)] text-[14px] font-semibold text-white transition-colors hover:bg-[rgb(14_14_14/0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:left-8 lg:top-6"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          Activar sonido
        </button>
      )}
    </>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { Exercise } from '@/types/workout';

/*
 * The first screen's porthole (phone): a circle of video in the dark page, its edge feathered
 * away. It shows the clip standing in for the suggestion at the centre of the drum, or Marcel's
 * usual still (today's first frame of the creator) while the user types or when there is no clip.
 *
 * One <video> only, never two playing: on a change the clip fades out to the new clip's poster
 * (an <img>, light), the video loads the new source underneath and fades back in once it plays.
 * Nothing is fetched for rockets that are not centred, and a change waits for the drum to settle
 * (the caller only changes `clip` then) plus a short debounce.
 */

const NEUTRAL = '/marcel-ready-poster.webp';
const DEBOUNCE_MS = 260;
const FADE_MS = 320;
// the soft edge: solid in the middle, fading out to nothing at the rim
const FEATHER = 'radial-gradient(circle closest-side, #000 56%, transparent 100%)';

export function Porthole({ clip, neutral, className = '' }: { clip: Exercise | null; neutral: boolean; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const showing = useRef<string | null>(null);
  const retry = useRef<(() => void) | null>(null);

  // Muted and inline as attributes too (some phones look at the attributes before letting a video
  // play on its own), and no retry left behind on unmount.
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
    }
    return () => retry.current?.();
  }, []);

  /**
   * Plays the clip on its own, as soon as it can. If the phone refuses (no touch yet, battery
   * saving), the clip's poster stays up and it plays at the user's first touch anywhere.
   */
  const play = (video: HTMLVideoElement) => {
    retry.current?.();
    video.play().catch(() => {
      const again = () => {
        retry.current?.();
        video.play().catch(() => {});
      };
      const events = ['pointerdown', 'touchstart', 'keydown'] as const;
      events.forEach((name) => window.addEventListener(name, again, { capture: true, passive: true }));
      retry.current = () => {
        events.forEach((name) => window.removeEventListener(name, again, { capture: true }));
        retry.current = null;
      };
    });
  };

  useEffect(() => {
    const video = videoRef.current;
    const poster = posterRef.current;
    if (!video || !poster) return;
    const want = neutral ? null : clip;
    const hide = () => {
      video.dataset.on = 'false';
      poster.dataset.on = 'false';
    };
    if (!want) {
      retry.current?.();
      hide();
      const pause = setTimeout(() => video.pause(), FADE_MS);
      return () => clearTimeout(pause);
    }
    const cleanup: (() => void)[] = [];
    const timer = setTimeout(() => {
      if (showing.current === want.id) {
        // the same clip as before (back from typing): play on
        poster.dataset.on = want.poster_url ? 'true' : 'false';
        play(video);
        if (!video.paused || video.readyState >= 3) video.dataset.on = 'true';
        return;
      }
      showing.current = want.id;
      video.dataset.on = 'false';
      // the poster first (fades in when loaded), then the clip under it
      if (want.poster_url) {
        poster.dataset.on = 'false';
        poster.src = want.poster_url;
        // (already in the cache: no load event comes)
        if (poster.complete && poster.naturalWidth > 0) poster.dataset.on = 'true';
      } else {
        poster.removeAttribute('src');
        poster.dataset.on = 'false';
      }
      const swap = setTimeout(() => {
        video.pause();
        video.poster = want.poster_url ?? '';
        video.preload = 'auto';
        video.src = playbackUrl(want);
        video.load();
        play(video);
      }, FADE_MS);
      cleanup.push(() => clearTimeout(swap));
    }, DEBOUNCE_MS);
    cleanup.push(() => clearTimeout(timer));
    return () => cleanup.forEach((fn) => fn());
  }, [clip, neutral]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden rounded-full bg-[#3a3936] ${className}`}
      style={{ WebkitMaskImage: FEATHER, maskImage: FEATHER }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local still, already small */}
      <img src={NEUTRAL} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_30%] grayscale brightness-[1.06] contrast-[1.04]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- the clip's poster from the media CDN, set imperatively */}
      <img
        ref={posterRef}
        alt=""
        data-on="false"
        onLoad={(e) => {
          if (!neutral && clip?.poster_url && e.currentTarget.src) e.currentTarget.dataset.on = 'true';
        }}
        className="absolute inset-0 h-full w-full object-cover opacity-0 grayscale transition-opacity duration-300 data-[on=true]:opacity-100 motion-reduce:transition-none"
      />
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        data-on="false"
        onPlaying={(e) => {
          if (!neutral && clip) e.currentTarget.dataset.on = 'true';
        }}
        onError={(e) => {
          const el = e.currentTarget;
          if (clip && showing.current === clip.id && retryWithOriginal(el, clip)) el.play().catch(() => {});
        }}
        className="absolute inset-0 h-full w-full object-cover opacity-0 grayscale transition-opacity duration-300 data-[on=true]:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}

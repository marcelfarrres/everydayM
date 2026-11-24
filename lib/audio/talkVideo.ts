import { getMusicEngine } from './music';
import { TALK_IDLE, talkAudioReducer, talkDucksMusic, type TalkAudioEvent, type TalkAudioState } from './mix';

/*
 * The one <video> that plays every vídeo hablado (talk), for the whole visit.
 *
 * iPhone refuses to start a freshly created un-muted <video> without a tap, but an element that
 * was played once from a tap may later play with sound on its own. So this element is created
 * and played (then paused) inside the "Empezar" tap, and every talk reuses it by swapping `src`.
 * Between talks it waits off-screen in <body>; TalkReel moves it into the stage while a talk
 * shows. It lives outside React on purpose: React would make a new element on each mount.
 *
 * Its real playback events drive the music ducking, so the music can't stay low by mistake.
 */

let video: HTMLVideoElement | null = null;
let talkState: TalkAudioState = TALK_IDLE;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

const PARKED = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
// Between two talks of the same rest the element stops for a moment while the next one loads:
// wait this long before bringing the music back up, so it doesn't swell and drop again.
const RESTORE_HOLD_MS = 400;

function report(event: TalkAudioEvent, immediate = false) {
  talkState = talkAudioReducer(talkState, event);
  const engine = getMusicEngine();
  if (talkDucksMusic(talkState) || immediate) {
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = null;
    engine?.setDucked(talkDucksMusic(talkState));
    return;
  }
  restoreTimer ??= setTimeout(() => {
    restoreTimer = null;
    engine?.setDucked(talkDucksMusic(talkState));
  }, RESTORE_HOLD_MS);
}

function park(el: HTMLVideoElement) {
  el.className = '';
  el.style.cssText = PARKED;
  el.setAttribute('aria-hidden', 'true');
  if (el.parentNode !== document.body) document.body.appendChild(el);
}

/** The shared talk element (created on first use; null on the server). */
export function getTalkVideo(): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  if (video) return video;
  const el = document.createElement('video');
  el.playsInline = true;
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.preload = 'auto';
  el.addEventListener('playing', () => report({ type: 'playing' }));
  for (const type of ['pause', 'ended', 'emptied', 'abort', 'error']) {
    el.addEventListener(type, () => report({ type: 'stopped' }));
  }
  el.addEventListener('volumechange', () => report({ type: 'volume', muted: el.muted, volume: el.volume }));
  park(el);
  video = el;
  return el;
}

/**
 * Inside the "Empezar" tap (synchronously): play the element with sound and pause it at once,
 * which is what lets later talks start with sound on iPhone. `src` (the first talk of the
 * routine, if any) also starts loading it early.
 */
export function primeTalkVideo(src?: string) {
  const el = getTalkVideo();
  if (!el) return;
  if (src && el.getAttribute('src') !== src) el.src = src;
  el.muted = false;
  if (!el.paused) return;
  el.play().catch(() => {});
  el.pause();
}

/** Show the element inside `host` (filling it with `className`). */
export function attachTalkVideo(host: HTMLElement, className: string): HTMLVideoElement | null {
  const el = getTalkVideo();
  if (!el) return null;
  el.style.cssText = '';
  el.className = className;
  el.removeAttribute('aria-hidden');
  host.appendChild(el);
  return el;
}

/** Point the element at a talk (keeps it as is when it already holds that file). */
export function setTalkSource(el: HTMLVideoElement, src: string, poster: string | null) {
  if (poster) el.poster = poster;
  else el.removeAttribute('poster');
  if (el.getAttribute('src') !== src) el.src = src;
}

/** Stop the talk and put the element back off-screen. Only the host that holds it can release it. */
export function releaseTalkVideo(host?: HTMLElement) {
  const el = video;
  if (!el || (host && el.parentNode !== host)) return;
  el.pause();
  el.removeAttribute('src');
  el.removeAttribute('poster');
  el.load();
  report({ type: 'stopped' }, true); // the rest is over: music back at once
  park(el);
}

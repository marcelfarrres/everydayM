import { getAudioContext } from '@/lib/audio';
import { logAudio } from './audioLog';
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
 * They also wake the music's watchdog: on iPhone, this element starting with sound pauses the
 * music <audio> (see watchdog.ts), and the watchdog plays it again, lowered, under the voice.
 *
 * Its sound goes straight to the speaker. With `?voicegraph=1` in the URL (an experiment, to
 * compare on the phone) it goes through the shared AudioContext instead (crossOrigin
 * "anonymous" + one MediaElementAudioSourceNode, made once): then its fade works on iPhone too,
 * but if the context is interrupted the voice goes silent with the music, and on iOS this does
 * not stop the system from pausing the music (the element is still a video with sound).
 */

let video: HTMLVideoElement | null = null;
let talkState: TalkAudioState = TALK_IDLE;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;
let fadeFrame = 0;
let voiceGain: GainNode | null = null; // only when the voice goes through Web Audio

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

/** The page asked to route the voice through Web Audio (`?voicegraph=1`). */
function voiceGraphRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('voicegraph') === '1';
  } catch {
    return false;
  }
}

/** Before any src: the voice into the shared AudioContext, or nothing (it stays direct). */
function routeThroughGraph(el: HTMLVideoElement) {
  if (!voiceGraphRequested()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    el.crossOrigin = 'anonymous'; // without CORS the graph would only get silence
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(ctx.destination);
    voiceGain = gain;
  } catch {
    el.removeAttribute('crossorigin');
    voiceGain = null;
  }
}

/** How the talks' sound reaches the speaker: 'graph' (Web Audio), 'direct', or 'none' yet. */
export function talkVoiceRoute(): 'graph' | 'direct' | 'none' {
  if (!video) return 'none';
  return voiceGain ? 'graph' : 'direct';
}

/** For the audio debug overlay: the talk element as it is (never creates it). */
export function talkDebugState() {
  if (!video) return null;
  return {
    route: talkVoiceRoute(),
    paused: video.paused,
    muted: video.muted,
    time: video.currentTime,
    readyState: video.readyState,
    hasSrc: video.hasAttribute('src'),
    ducks: talkDucksMusic(talkState),
  };
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
  routeThroughGraph(el);
  el.addEventListener('playing', () => {
    logAudio(`voz playing${el.muted ? ' (muda)' : ''}`);
    report({ type: 'playing' });
    getMusicEngine()?.kick('voz empieza');
  });
  for (const type of ['pause', 'ended', 'emptied', 'abort', 'error']) {
    el.addEventListener(type, () => {
      if (type !== 'emptied' && type !== 'abort') logAudio(`voz ${type}`);
      report({ type: 'stopped' });
      getMusicEngine()?.kick(`voz ${type}`);
    });
  }
  el.addEventListener('volumechange', () => report({ type: 'volume', muted: el.muted, volume: el.volume }));
  park(el);
  video = el;
  // The watchdog's safety net: the music is never left low with no voice sounding (the short
  // hold between two talks counts as voice).
  getMusicEngine()?.setVoiceProbe(
    () => restoreTimer !== null || (video !== null && !video.paused && !video.ended && talkDucksMusic(talkState)),
  );
  return el;
}

/** Inside a tap right now (unknown on old browsers: assume yes, as before). */
function inUserGesture(): boolean {
  const activation = typeof navigator !== 'undefined' ? navigator.userActivation : undefined;
  return activation ? activation.isActive : true;
}

/**
 * Inside the "Empezar" tap (synchronously): play the element with sound and pause it at once,
 * which is what lets later talks start with sound on iPhone. `src` (the first talk of the
 * routine, if any) also starts loading it early. Outside a tap (the creator starts the workout
 * on its own, its last tap already did this) only the src is set: a play() there unlocks
 * nothing, and on iPhone a video starting with sound pauses the music that just began.
 */
export function primeTalkVideo(src?: string) {
  const el = getTalkVideo();
  if (!el) return;
  if (src && el.getAttribute('src') !== src) el.src = src;
  el.muted = false;
  if (!el.paused || !inUserGesture()) return;
  el.play().catch(() => {});
  el.pause();
}

/** Show the element inside `host` (filling it with `className`). */
export function attachTalkVideo(host: HTMLElement, className: string): HTMLVideoElement | null {
  const el = getTalkVideo();
  if (!el) return null;
  stopFade(el);
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
  stopFade(el);
  el.pause();
  el.removeAttribute('src');
  el.removeAttribute('poster');
  el.load();
  report({ type: 'stopped' }, true); // the rest is over: music back at once
  getMusicEngine()?.kick('descanso acaba');
  park(el);
}

/** The voice's own level: its GainNode when it goes through Web Audio, else the element's volume. */
function voiceLevel(el: HTMLVideoElement): number {
  return voiceGain ? voiceGain.gain.value : el.volume;
}

function setVoiceLevel(el: HTMLVideoElement, level: number) {
  const v = Math.min(1, Math.max(0, level));
  if (voiceGain) voiceGain.gain.value = v;
  else el.volume = v;
}

/** Back to full voice (a fade may have left it low). */
function stopFade(el: HTMLVideoElement) {
  if (fadeFrame) cancelAnimationFrame(fadeFrame);
  fadeFrame = 0;
  if (voiceLevel(el) !== 1) setVoiceLevel(el, 1);
}

/**
 * The talk's voice goes with its picture: down to nothing over `ms`, then the talk stops. (Its
 * host fades the picture.) As the volume reaches 0 the music comes back up by itself (the
 * ducking follows the element). iPhone ignores `volume`: there the voice simply stops at the end
 * (unless it goes through Web Audio, `?voicegraph=1`).
 */
export function fadeOutTalk(ms: number) {
  const el = video;
  if (!el) return;
  if (fadeFrame) cancelAnimationFrame(fadeFrame);
  const from = voiceLevel(el);
  const start = performance.now();
  const step = (now: number) => {
    // A frame's timestamp can be earlier than `start` (it is the time the frame began), so p is
    // clamped at both ends: `volume` throws outside [0, 1].
    const p = ms > 0 ? Math.min(1, Math.max(0, (now - start) / ms)) : 1;
    setVoiceLevel(el, from * (1 - p));
    if (p < 1) fadeFrame = requestAnimationFrame(step);
    else {
      fadeFrame = 0;
      el.pause();
    }
  };
  fadeFrame = requestAnimationFrame(step);
}

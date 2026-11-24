import type { MusicTrack } from '@/types/catalog';
import { getAudioContext } from '@/lib/audio';
import {
  DEFAULT_MUSIC_SETTINGS,
  RAMP_SECONDS,
  musicGain,
  parseMusicSettings,
  serializeMusicSettings,
  shuffleOrder,
  type MusicSettings,
} from './mix';

/*
 * Background music: one shuffled playlist from the catalogue, on by default.
 *
 *   <audio> A â”€â”
 *              â”œâ”€ GainNode (volume Â· mute Â· ducking) â”€ AudioContext.destination
 *   <audio> B â”€â”˜
 *
 * iPhone ignores HTMLMediaElement.volume, so the level is a GainNode on the shared AudioContext.
 * Two elements take turns: one plays, the other has the next track preloaded (only that one).
 * Both are created and unlocked inside the "Empezar" tap (unlock()), because iPhone only lets an
 * element make sound once it has been played from a tap.
 *
 * Web Audio can only read a file whose host sends CORS headers. If it doesn't, the element
 * fails to load (it is `crossOrigin="anonymous"`) or, without that attribute, would play
 * silence. So a host without CORS is detected (a HEAD request in CORS mode, and any load error)
 * and the music falls back to plain elements outside Web Audio: it plays, but on iPhone its
 * volume can't change any more.
 */

type Route = 'graph' | 'direct';

interface Deck {
  el: HTMLAudioElement;
  track: number | null; // index into `urls`
}

const STORAGE_KEY = 'everydaym.music.v1';
const VOLUME_RAMP_SECONDS = 0.05; // the slider: quick, but without clicks

export interface MusicSnapshot extends MusicSettings {
  available: boolean; // the catalogue has at least one enabled track
}

const SERVER_SNAPSHOT: MusicSnapshot = { ...DEFAULT_MUSIC_SETTINGS, available: false };

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

function isNotAllowed(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotAllowedError';
}

export class MusicEngine {
  private urls: string[] = [];
  private order: number[] = [];
  private lastPlayed: number | null = null; // the track heard last
  private decks: [Deck, Deck] | null = null;
  private live = 0; // which deck plays
  private gain: GainNode | null = null;
  private route: Route = 'graph';
  private corsChecks = new Map<string, Promise<boolean>>();
  private settings: MusicSettings;
  private active = false; // the player is open
  private paused = false; // the player is paused
  private ducked = false; // a talk is speaking
  private hidden = false; // tab hidden / screen locked
  private failures = 0;
  private waitingForTap = false;
  private muteTimer: ReturnType<typeof setTimeout> | null = null;
  private volumeTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: MusicSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // private mode or storage blocked: defaults
    }
    this.settings = parseMusicSettings(stored);
    this.snapshot = { ...this.settings, available: false };
    this.hidden = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // â”€â”€ React glue (useSyncExternalStore) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): MusicSnapshot => this.snapshot;

  static serverSnapshot(): MusicSnapshot {
    return SERVER_SNAPSHOT;
  }

  private emit() {
    this.snapshot = { ...this.settings, available: this.urls.length > 0 };
    this.listeners.forEach((listener) => listener());
  }

  // â”€â”€ What the app calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** The playlist (enabled tracks). An empty list is a silent player. */
  setTracks(tracks: MusicTrack[]) {
    const urls = tracks.filter((t) => t.enabled && t.audio_url).map((t) => t.audio_url);
    if (urls.length === this.urls.length && urls.every((u, i) => u === this.urls[i])) return;
    this.urls = urls;
    this.order = [];
    this.lastPlayed = null;
    this.failures = 0;
    if (this.decks) {
      for (const deck of this.decks) this.unload(deck);
    }
    // Find out early whether the host lets Web Audio read the files.
    const crossOrigin = urls.find((u) => !sameOrigin(u));
    if (crossOrigin) {
      void this.hasCors(crossOrigin).then((ok) => {
        if (!ok) this.fallBackToDirect();
      });
    }
    this.emit();
    this.sync();
  }

  /**
   * Inside the "Empezar" tap (synchronously): wakes the AudioContext, creates both elements and
   * lets them make sound later. With `start`, the music begins now (if it is on and there are
   * tracks); without it, it only gets ready and begins when the player opens.
   */
  unlock(start: boolean) {
    getAudioContext();
    const decks = this.ensureDecks();
    if (start) {
      this.active = true;
      this.paused = false;
    }
    const liveDeck = decks[this.live];
    if (this.shouldPlay() && liveDeck.track === null) this.load(liveDeck, this.takeTrack(this.lastPlayed));
    for (const deck of decks) {
      if (deck === liveDeck && this.shouldPlay()) continue;
      if (!deck.el.paused) continue;
      deck.el.play().catch(() => {}); // the tap is what counts; it stops straight away
      deck.el.pause();
    }
    this.waitingForTap = false;
    this.sync(true);
  }

  /** The player opened (true) or is going away (false: see stop()). */
  setActive(active: boolean) {
    if (!active) {
      this.stop();
      return;
    }
    this.active = true;
    // Normally made in the "Empezar" tap; if not, try now (if refused, the next tap starts it).
    this.ensureDecks();
    this.sync(true);
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.sync(true);
  }

  /** Leaving the player: silence now, nothing left loading. The next routine starts a new track. */
  stop() {
    this.active = false;
    this.paused = false;
    this.ducked = false;
    this.clearTimers();
    if (this.decks) {
      for (const deck of this.decks) this.unload(deck);
    }
    this.applyGain(0);
  }

  setDucked(ducked: boolean) {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.applyGain(RAMP_SECONDS);
  }

  setVolume(volume: number) {
    this.settings = { ...this.settings, volume: Math.min(1, Math.max(0, volume)) };
    this.persist();
    this.emit();
    this.applyGain(VOLUME_RAMP_SECONDS);
  }

  /** Called from a tap in the menu: unmuting may start the music right there. */
  setMuted(muted: boolean) {
    if (muted === this.settings.muted) return;
    this.settings = { ...this.settings, muted };
    this.persist();
    this.emit();
    if (!muted) getAudioContext();
    this.sync(true);
  }

  /** For checks in development: what the engine is doing right now. */
  debugState() {
    const decks = this.decks?.map((d) => ({ src: d.el.currentSrc, paused: d.el.paused, time: d.el.currentTime, track: d.track }));
    return {
      route: this.route,
      active: this.active,
      paused: this.paused,
      ducked: this.ducked,
      hidden: this.hidden,
      settings: this.settings,
      tracks: this.urls.length,
      gain: this.gain?.gain.value ?? null,
      contextState: getAudioContext()?.state ?? null,
      live: this.live,
      decks,
    };
  }

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private shouldPlay(): boolean {
    return this.active && !this.paused && !this.settings.muted && !this.hidden && this.urls.length > 0;
  }

  private persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeMusicSettings(this.settings));
    } catch {
      // not remembered this time
    }
  }

  private ensureDecks(): [Deck, Deck] {
    if (this.decks) return this.decks;
    const ctx = getAudioContext();
    if (!ctx) this.route = 'direct';
    if (this.route === 'graph' && ctx && !this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(ctx.destination);
    }
    this.decks = [this.createDeck(), this.createDeck()];
    this.live = 0;
    return this.decks;
  }

  private createDeck(): Deck {
    const el = new Audio();
    el.preload = 'auto';
    const deck: Deck = { el, track: null };
    const ctx = getAudioContext();
    if (this.route === 'graph' && ctx && this.gain) {
      el.crossOrigin = 'anonymous';
      try {
        ctx.createMediaElementSource(el).connect(this.gain);
      } catch {
        this.route = 'direct';
      }
    }
    if (this.route === 'direct') el.volume = 0;
    el.addEventListener('ended', () => this.onEnded(deck));
    el.addEventListener('error', () => this.onError(deck));
    el.addEventListener('playing', () => {
      this.failures = 0;
      this.lastPlayed = deck.track;
    });
    return deck;
  }

  /** The next track of the shuffled playlist, never the same as `after` (the one before it). */
  private takeTrack(after: number | null): number | null {
    const count = this.urls.length;
    if (!count) return null;
    if (!this.order.length) this.order = shuffleOrder(count, after);
    if (count > 1 && this.order[0] === after) {
      if (this.order.length === 1) this.order.push(...shuffleOrder(count, after));
      [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
    }
    return this.order.shift() ?? null;
  }

  private load(deck: Deck, track: number | null) {
    deck.track = track;
    if (track === null) return;
    deck.el.src = this.urls[track];
  }

  private unload(deck: Deck) {
    deck.el.pause();
    deck.track = null;
    if (deck.el.hasAttribute('src')) {
      deck.el.removeAttribute('src');
      deck.el.load();
    }
  }

  /** Bring the elements in line with what should be heard. `fadeIn`: start from silence. */
  private sync(fadeIn = false) {
    if (!this.decks) return; // nothing exists before the first tap
    const deck = this.decks[this.live];
    if (this.muteTimer) {
      clearTimeout(this.muteTimer);
      this.muteTimer = null;
    }

    if (this.shouldPlay()) {
      if (deck.track === null) this.load(deck, this.takeTrack(this.lastPlayed));
      if (deck.track === null) return;
      if (deck.el.paused) {
        if (fadeIn) this.applyGain(0, 0);
        this.play(deck);
      }
      this.applyGain(RAMP_SECONDS);
      this.preloadOther();
      return;
    }

    // Muted while the player runs: fade out, then stop the element (no data, no battery).
    if (this.active && !this.paused && !this.hidden && this.settings.muted && !deck.el.paused) {
      this.applyGain(RAMP_SECONDS);
      this.muteTimer = setTimeout(() => {
        this.muteTimer = null;
        if (!this.shouldPlay()) this.pauseAll();
      }, RAMP_SECONDS * 1000 + 50);
      return;
    }
    this.pauseAll();
    this.applyGain(0);
  }

  private pauseAll() {
    this.decks?.forEach((d) => d.el.pause());
  }

  private play(deck: Deck) {
    getAudioContext(); // resume it if the system suspended it
    deck.el.play().catch((err: unknown) => {
      if (isNotAllowed(err)) this.waitForTap();
      // AbortError (paused or src changed meanwhile) needs nothing
    });
  }

  private preloadOther() {
    if (!this.decks) return;
    const other = this.decks[1 - this.live];
    if (other.track === null) this.load(other, this.takeTrack(this.decks[this.live].track));
  }

  private onEnded(deck: Deck) {
    if (!this.decks || deck !== this.decks[this.live]) return;
    deck.track = null;
    this.live = 1 - this.live;
    this.sync();
  }

  private onError(deck: Deck) {
    if (!this.decks || deck.track === null || !deck.el.getAttribute('src')) return;
    const url = this.urls[deck.track];
    // A host without CORS fails every file when read through Web Audio: switch, don't skip.
    if (this.route === 'graph' && url && !sameOrigin(url)) {
      void this.hasCors(url).then((ok) => {
        if (!ok) this.fallBackToDirect();
        else this.skip(deck);
      });
      return;
    }
    this.skip(deck);
  }

  /** A broken track: play another one. Gives up (silent) once every track has failed twice. */
  private skip(deck: Deck) {
    if (!this.decks) return;
    this.failures += 1;
    deck.el.pause();
    deck.track = null;
    if (this.failures > this.urls.length * 2) return;
    if (deck === this.decks[this.live]) {
      const other = this.decks[1 - this.live];
      if (other.track !== null) this.live = 1 - this.live;
    }
    this.sync();
  }

  private hasCors(url: string): Promise<boolean> {
    let check = this.corsChecks.get(url);
    if (!check) {
      check = fetch(url, { method: 'HEAD', mode: 'cors', cache: 'no-store' }).then(
        () => true,
        () => false,
      );
      this.corsChecks.set(url, check);
    }
    return check;
  }

  /** The host sends no CORS headers: rebuild the elements outside Web Audio. */
  private fallBackToDirect() {
    if (this.route === 'direct') return;
    this.route = 'direct';
    if (!this.decks) return; // created direct on the first tap
    const playing = this.decks[this.live].track;
    const upcoming = this.decks[1 - this.live].track;
    for (const deck of this.decks) this.unload(deck);
    this.gain?.disconnect();
    this.gain = null;
    this.decks = [this.createDeck(), this.createDeck()];
    this.live = 0;
    if (playing !== null) this.load(this.decks[0], playing);
    if (upcoming !== null) this.load(this.decks[1], upcoming);
    // These elements were not touched by a tap: on iPhone they may need the next one.
    this.sync(true);
  }

  /** The browser refused to start the music without a tap: start it on the next one. */
  private waitForTap() {
    if (this.waitingForTap) return;
    this.waitingForTap = true;
    const resume = () => {
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('keydown', resume, true);
      if (!this.waitingForTap) return;
      this.waitingForTap = false;
      this.unlock(false);
    };
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('keydown', resume, true);
  }

  private onVisibility = () => {
    this.hidden = document.visibilityState === 'hidden';
    // Hidden: let it go quietly (the browser would suspend it anyway). Visible: pick up again.
    this.sync(true);
  };

  private clearTimers() {
    if (this.muteTimer) clearTimeout(this.muteTimer);
    if (this.volumeTimer) clearInterval(this.volumeTimer);
    this.muteTimer = null;
    this.volumeTimer = null;
  }

  /** Move the music level to where it should be, over `seconds`. `level` overrides the target. */
  private applyGain(seconds: number, level?: number) {
    const target = level ?? musicGain({ ...this.settings, ducked: this.ducked });
    const ctx = getAudioContext();
    if (this.route === 'graph' && this.gain && ctx) {
      const param = this.gain.gain;
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      if (seconds > 0) param.linearRampToValueAtTime(target, now + seconds);
      else param.setValueAtTime(target, now);
      return;
    }
    // Direct elements: volume (works on computers and Android; iPhone ignores it).
    if (!this.decks) return;
    if (this.volumeTimer) clearInterval(this.volumeTimer);
    this.volumeTimer = null;
    const els = this.decks.map((d) => d.el);
    const from = els[this.live].volume;
    const steps = Math.max(1, Math.round((seconds * 1000) / 30));
    let step = 0;
    const set = (v: number) => els.forEach((el) => (el.volume = Math.min(1, Math.max(0, v))));
    if (steps <= 1) {
      set(target);
      return;
    }
    this.volumeTimer = setInterval(() => {
      step += 1;
      set(from + ((target - from) * step) / steps);
      if (step >= steps && this.volumeTimer) {
        clearInterval(this.volumeTimer);
        this.volumeTimer = null;
      }
    }, 30);
  }
}

let engine: MusicEngine | null = null;

/** The one music engine of the page (null on the server). */
export function getMusicEngine(): MusicEngine | null {
  if (typeof window === 'undefined') return null;
  engine ??= new MusicEngine();
  return engine;
}

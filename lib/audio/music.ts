import type { MusicStyle, MusicTrack } from '@/types/catalog';
import { getAudioContext, peekAudioContext } from '@/lib/audio';
import { isAudioDebug, logAudio } from './audioLog';
import { WATCHDOG_DELAYS_MS, WATCHDOG_POLL_MS, contextNeedsResume, pauseIsUnexpected, retryDelayMs, watchdogPlan } from './watchdog';
import {
  DEFAULT_MUSIC_SETTINGS,
  RAMP_SECONDS,
  effectiveStyle,
  musicGain,
  offeredStyles,
  parseMusicSettings,
  playlistFor,
  serializeMusicSettings,
  shuffleOrder,
  type MusicSettings,
} from './mix';

/*
 * Background music: one shuffled playlist from the catalogue (the chosen style's tracks, or
 * all of them with «Todas»), on by default.
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
 *
 * Under a talk the music is only ever lowered (setDucked: a gain ramp), never paused by this
 * code. iPhone itself pauses the music element when the talk <video> starts with sound, and the
 * system may suspend or interrupt the AudioContext: a watchdog (watchdog.ts) puts the music back
 * while the workout runs, and shows «Activar sonido» (needsTap) if the browser wants a tap.
 */

type Route = 'graph' | 'direct';

interface Deck {
  el: HTMLAudioElement;
  track: number | null; // index into `urls`
}

// v2: the default volume went down to 0.4, so everyone starts there once; what they choose
// afterwards is remembered under this key. (v1 is read once for its mute, then removed.)
// The music style was added to the same key: settings saved without it load as «Todas»,
// keeping their volume and mute, so the key did not need to change.
const STORAGE_KEY = 'everydaym.music.v2';
const OLD_STORAGE_KEYS = ['everydaym.music.v1'];
const VOLUME_RAMP_SECONDS = 0.05; // the slider: quick, but without clicks
const END_FADE_SECONDS = 1; // the routine's end: the music fades out and stops (setEnded)

export interface MusicSnapshot extends MusicSettings {
  // `style` here is the style that plays: the chosen one, or null («Todas») when it has no tracks
  available: boolean; // the catalogue has at least one enabled track
  styles: MusicStyle[]; // the styles the menu offers ([]: no track has a style, no choice shown)
  needsTap: boolean; // the browser won't bring the music back without a tap: the player shows «Activar sonido»
}

const SERVER_SNAPSHOT: MusicSnapshot = { ...DEFAULT_MUSIC_SETTINGS, available: false, styles: [], needsTap: false };

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

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
  private tracks: MusicTrack[] = []; // the catalogue's tracks, every style
  private urls: string[] = []; // the playlist: the chosen style's enabled tracks (all with «Todas»)
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
  private ended = false; // the routine reached its end screen (phone): faded out, the drums play alone
  private failures = 0;
  private waitingForTap = false; // the browser refused without a tap (play() or resume())
  private needsTap = false; // ...and the player shows «Activar sonido»
  private watchAttempts = 0; // the watchdog's recoveries in this episode
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private watchPoll: ReturnType<typeof setInterval> | null = null;
  private watchedContext: AudioContext | null = null;
  private kickReason = ''; // what woke the watchdog last (for the debug log)
  private voiceAudible: () => boolean = () => false; // set by talkVideo.ts: a talk sounds right now
  private switching = false; // the style changed while playing: fading out before the new playlist
  private switchTimer: ReturnType<typeof setTimeout> | null = null;
  private muteTimer: ReturnType<typeof setTimeout> | null = null;
  private volumeTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: MusicSnapshot;
  private listeners = new Set<() => void>();
  private duckListeners = new Set<(ducked: boolean) => void>(); // the sound effects follow it

  constructor() {
    let stored: string | null = null;
    let legacy: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
      for (const key of OLD_STORAGE_KEYS) {
        legacy ??= window.localStorage.getItem(key);
        window.localStorage.removeItem(key);
      }
    } catch {
      // private mode or storage blocked: defaults
    }
    this.settings = parseMusicSettings(stored);
    // Coming from v1: the new default volume, but keep the mute they had chosen.
    if (stored === null && legacy !== null) {
      this.settings.muted = parseMusicSettings(legacy).muted;
      this.persist();
    }
    this.snapshot = this.makeSnapshot();
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

  private makeSnapshot(): MusicSnapshot {
    return {
      ...this.settings,
      style: effectiveStyle(this.settings.style, this.tracks),
      available: this.urls.length > 0,
      styles: offeredStyles(this.tracks),
      needsTap: this.needsTap,
    };
  }

  private emit() {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  /** A vídeo hablado is speaking (the music is ducked for it). */
  isDucked(): boolean {
    return this.ducked;
  }

  /** Told whenever a talk starts or stops speaking (the sound effects quiet down under it). */
  onDuckedChange(listener: (ducked: boolean) => void): () => void {
    this.duckListeners.add(listener);
    return () => this.duckListeners.delete(listener);
  }

  private emitDucked() {
    this.duckListeners.forEach((listener) => listener(this.ducked));
  }

  // â”€â”€ What the app calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * The catalogue's tracks. The playlist is the enabled ones of the chosen style (every enabled
   * one with «Todas», or when that style has none left). An empty list is a silent player.
   */
  setTracks(tracks: MusicTrack[]) {
    this.tracks = tracks;
    this.refreshPlaylist();
    this.emit();
  }

  /**
   * From the "···" menu: the style to play, null = «Todas». Remembered with the volume. While
   * the music plays it fades out and a track of the new style fades in; the workout, the
   * pause and the ducking under a talk are left as they are.
   */
  setStyle(style: MusicStyle | null) {
    if (style === this.settings.style) return;
    this.settings = { ...this.settings, style };
    this.persist();
    this.refreshPlaylist();
    this.emit();
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
    this.watchAttempts = 0;
    this.sync(true);
    if (this.active) this.kick('desbloqueo');
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
    this.watchPoll ??= setInterval(() => {
      if (!this.watchTimer) this.watch();
    }, WATCHDOG_POLL_MS);
    this.kick('reproductor abierto');
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.sync(true);
    if (!paused) this.kick('reanudar');
  }

  /**
   * Something may have stopped the music (a talk started or ended, the system paused the
   * element, the context changed state): look again soon, and bring it back if it should sound.
   */
  kick(reason: string) {
    if (!this.active) return;
    this.kickReason = reason; // (the log shows it only if the check then has to act)
    this.scheduleWatch(WATCHDOG_DELAYS_MS[0]);
  }

  /** talkVideo.ts tells whether a talk is sounding right now (a safety net for the ducking). */
  setVoiceProbe(probe: () => boolean) {
    this.voiceAudible = probe;
  }

  /**
   * The routine is over (the phone's end screen): the music fades out over `seconds` and stops,
   * so the end's drum roll plays alone; `false` (a new routine, "Repetir") brings it back. Volume
   * and mute are untouched: the sound effects keep following them.
   */
  setEnded(ended: boolean, seconds = END_FADE_SECONDS) {
    if (ended === this.ended) return;
    this.ended = ended;
    if (!ended) {
      this.sync(true);
      return;
    }
    if (!this.decks) return;
    if (this.muteTimer) clearTimeout(this.muteTimer);
    this.applyGain(seconds, 0);
    this.muteTimer = setTimeout(() => {
      this.muteTimer = null;
      if (!this.shouldPlay()) this.pauseAll();
    }, seconds * 1000 + 50);
  }

  /** Leaving the player: silence now, nothing left loading. The next routine starts a new track. */
  stop() {
    this.active = false;
    this.ended = false;
    this.paused = false;
    const wasDucked = this.ducked;
    this.ducked = false;
    if (wasDucked) this.emitDucked();
    const switching = this.switching;
    this.switching = false;
    this.clearTimers();
    if (this.decks) {
      for (const deck of this.decks) this.unload(deck);
    }
    // Left in the middle of a style change: the next routine plays the new style.
    if (switching) this.adoptPlaylist(this.currentPlaylist());
    this.applyGain(0);
    this.watchAttempts = 0;
    this.setNeedsTap(false);
  }

  /** A talk speaks (true) or stopped (false): the music only goes down and up, it is never paused for it. */
  setDucked(ducked: boolean) {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    logAudio(ducked ? 'música baja (voz)' : 'música sube');
    this.applyGain(RAMP_SECONDS);
    this.emitDucked();
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
    const decks = this.decks?.map((d) => ({
      src: d.el.currentSrc,
      paused: d.el.paused,
      time: d.el.currentTime,
      readyState: d.el.readyState,
      track: d.track,
    }));
    return {
      needsTap: this.needsTap,
      watchAttempts: this.watchAttempts,
      wanted: this.shouldPlay(),
      route: this.route,
      active: this.active,
      paused: this.paused,
      ducked: this.ducked,
      ended: this.ended,
      hidden: this.hidden,
      settings: this.settings,
      style: effectiveStyle(this.settings.style, this.tracks),
      switching: this.switching,
      tracks: this.urls.length,
      gain: this.gain?.gain.value ?? null,
      contextState: peekAudioContext()?.state ?? null,
      live: this.live,
      decks,
    };
  }

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private shouldPlay(): boolean {
    return this.active && !this.ended && !this.paused && !this.settings.muted && !this.hidden && this.urls.length > 0;
  }

  private persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeMusicSettings(this.settings));
    } catch {
      // not remembered this time
    }
  }

  private currentPlaylist(): string[] {
    return playlistFor(this.tracks, this.settings.style).map((t) => t.audio_url);
  }

  /**
   * Bring the playlist in line with the tracks and the chosen style. While music is heard the
   * change waits for the level to fade out (RAMP_SECONDS, the same fade as muting); otherwise
   * it is immediate.
   */
  private refreshPlaylist() {
    const deck = this.decks?.[this.live];
    const audible = this.switching || (deck !== undefined && deck.track !== null && !deck.el.paused && this.shouldPlay());
    if (!audible) {
      this.adoptPlaylist(this.currentPlaylist());
      return;
    }
    if (!this.switching && sameList(this.currentPlaylist(), this.urls)) return;
    this.switching = true;
    this.applyGain(RAMP_SECONDS); // to 0 while switching
    if (this.switchTimer) clearTimeout(this.switchTimer);
    this.switchTimer = setTimeout(() => {
      this.switchTimer = null;
      this.switching = false;
      // The new playlist fades in; if it ended up the same one (chosen back), the level returns.
      if (!this.adoptPlaylist(this.currentPlaylist(), true)) this.sync();
      this.emit();
    }, RAMP_SECONDS * 1000 + 50);
  }

  /** Play from these files from now on. False when they are already the playlist. */
  private adoptPlaylist(urls: string[], fadeIn = false): boolean {
    if (sameList(urls, this.urls)) return false;
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
    this.sync(fadeIn);
    return true;
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
    if (ctx && this.watchedContext !== ctx) {
      this.watchedContext = ctx;
      ctx.addEventListener('statechange', () => {
        logAudio(`contexto → ${ctx.state}`);
        if (contextNeedsResume(ctx.state)) this.kick(`contexto ${ctx.state}`);
      });
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
      logAudio('música playing');
    });
    // iPhone pauses this element by itself when a talk <video> starts with sound: bring it back.
    el.addEventListener('pause', () => {
      const live = this.decks !== null && deck === this.decks[this.live];
      if (!live) return;
      const unexpected = pauseIsUnexpected({ live, wanted: this.shouldPlay() });
      logAudio(unexpected ? 'música pause (no pedida)' : 'música pause');
      if (unexpected) this.kick('pausa no pedida');
    });
    if (isAudioDebug()) {
      el.addEventListener('stalled', () => logAudio('música stalled'));
      el.addEventListener('waiting', () => logAudio('música waiting'));
    }
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
      logAudio(`música play() rechazado: ${err instanceof DOMException ? err.name : 'error'}`);
      if (isNotAllowed(err)) this.waitForTap();
      // AbortError (paused or src changed meanwhile) needs nothing
    });
  }

  // ── The watchdog (rules in watchdog.ts) ──

  private scheduleWatch(ms: number) {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      this.watch();
    }, ms);
  }

  /** Look at the music and the context; bring the music back if it should sound and doesn't. */
  private watch() {
    if (!this.active) return;
    const deck = this.decks?.[this.live];
    const ctx = peekAudioContext();
    const plan = watchdogPlan({
      wanted: this.shouldPlay(),
      gaveUp: this.failures > this.urls.length * 2,
      route: this.route,
      context: ctx?.state ?? null,
      musicPlaying: deck !== undefined && deck.track !== null && !deck.el.paused,
      attempts: this.watchAttempts,
      refused: this.waitingForTap,
      ducked: this.ducked,
      voiceAudible: this.voiceAudible(),
    });
    if (plan.restoreLevel) {
      logAudio('vigía: la música seguía baja sin voz');
      this.setDucked(false);
    }
    switch (plan.action) {
      case 'idle':
      case 'ok':
        this.watchAttempts = 0;
        this.kickReason = '';
        if (plan.action === 'ok') {
          this.waitingForTap = false; // it sounds again: no tap is owed any more
          this.setNeedsTap(false);
        }
        return;
      case 'ask-tap':
        if (!this.needsTap) logAudio('vigía: hace falta un toque');
        this.waitForTap();
        return;
      case 'recover': {
        this.watchAttempts += 1;
        const why = this.kickReason ? ` (${this.kickReason})` : '';
        logAudio(`vigía: intento ${this.watchAttempts}${plan.resumeContext ? ' resume()' : ''}${plan.playMusic ? ' play()' : ''}${why}`);
        this.kickReason = '';
        if (plan.resumeContext && ctx) {
          ctx.resume().catch((err: unknown) => {
            logAudio(`resume() rechazado: ${err instanceof DOMException ? err.name : 'error'}`);
            if (isNotAllowed(err)) this.waitForTap();
          });
        }
        if (plan.playMusic) this.sync();
        // and look again, to confirm or to try once more
        this.scheduleWatch(retryDelayMs(this.watchAttempts));
      }
    }
  }

  private setNeedsTap(needsTap: boolean) {
    if (needsTap === this.needsTap) return;
    this.needsTap = needsTap;
    this.emit();
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
      void check.then((ok) => logAudio(`CORS de la música: ${ok ? 'sí' : 'NO'}`));
      this.corsChecks.set(url, check);
    }
    return check;
  }

  /** The host sends no CORS headers: rebuild the elements outside Web Audio. */
  private fallBackToDirect() {
    if (this.route === 'direct') return;
    this.route = 'direct';
    logAudio('música sin Web Audio (directa)');
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
    // While the player is open it says so («Activar sonido»); any tap anywhere also does it.
    if (this.active) this.setNeedsTap(true);
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
    logAudio(this.hidden ? 'página oculta' : 'página visible');
    // Hidden: let it go quietly (the browser would suspend it anyway). Visible: pick up again.
    this.sync(true);
    if (!this.hidden) this.kick('página visible');
  };

  private clearTimers() {
    if (this.muteTimer) clearTimeout(this.muteTimer);
    if (this.volumeTimer) clearInterval(this.volumeTimer);
    if (this.switchTimer) clearTimeout(this.switchTimer);
    if (this.watchTimer) clearTimeout(this.watchTimer);
    if (this.watchPoll) clearInterval(this.watchPoll);
    this.muteTimer = null;
    this.volumeTimer = null;
    this.switchTimer = null;
    this.watchTimer = null;
    this.watchPoll = null;
  }

  /** Move the music level to where it should be, over `seconds`. `level` overrides the target. */
  private applyGain(seconds: number, level?: number) {
    // (once the routine has ended nothing brings the level back up: a volume change, say;
    // nor while a style change fades out the track it replaces)
    const target = level ?? (this.ended || this.switching ? 0 : musicGain({ ...this.settings, ducked: this.ducked }));
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

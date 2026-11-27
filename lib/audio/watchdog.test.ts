import { describe, expect, it } from 'vitest';
import { AUDIO_LOG_SIZE, audioDebugRequested, formatLogTime, pushLogEntry } from './audioLog';
import { DUCK_LEVEL, TALK_IDLE, musicGain, talkAudioReducer, talkDucksMusic } from './mix';
import {
  WATCHDOG_DELAYS_MS,
  WATCHDOG_MAX_ATTEMPTS,
  contextNeedsResume,
  pauseIsUnexpected,
  retryDelayMs,
  watchdogPlan,
  type WatchdogInput,
} from './watchdog';

// A workout running with the music heard: nothing to do.
const FINE: WatchdogInput = {
  wanted: true,
  gaveUp: false,
  route: 'graph',
  context: 'running',
  musicPlaying: true,
  attempts: 0,
  refused: false,
  ducked: false,
  voiceAudible: false,
};

describe('music watchdog', () => {
  it('does nothing while the music sounds as it should', () => {
    expect(watchdogPlan(FINE)).toEqual({ action: 'ok', resumeContext: false, playMusic: false, restoreLevel: false });
  });

  it('plays the music again when a talk video made iOS pause it', () => {
    const plan = watchdogPlan({ ...FINE, musicPlaying: false, ducked: true, voiceAudible: true });
    expect(plan.action).toBe('recover');
    expect(plan.playMusic).toBe(true);
    expect(plan.resumeContext).toBe(false);
    expect(plan.restoreLevel).toBe(false); // the voice is on: it stays low, but it sounds
  });

  it('resumes a suspended or interrupted context, but not a direct route', () => {
    expect(watchdogPlan({ ...FINE, context: 'interrupted' })).toMatchObject({ action: 'recover', resumeContext: true, playMusic: false });
    expect(watchdogPlan({ ...FINE, context: 'suspended' })).toMatchObject({ action: 'recover', resumeContext: true });
    expect(watchdogPlan({ ...FINE, route: 'direct', context: 'interrupted' })).toMatchObject({ action: 'ok' });
  });

  it('does both when both are needed', () => {
    expect(watchdogPlan({ ...FINE, context: 'interrupted', musicPlaying: false })).toMatchObject({
      action: 'recover',
      resumeContext: true,
      playMusic: true,
    });
  });

  it('never touches the music when the user paused, muted or left (not wanted)', () => {
    const plan = watchdogPlan({ ...FINE, wanted: false, musicPlaying: false, context: 'suspended' });
    expect(plan).toEqual({ action: 'idle', resumeContext: false, playMusic: false, restoreLevel: false });
  });

  it('gives up quietly when every track is broken', () => {
    expect(watchdogPlan({ ...FINE, gaveUp: true, musicPlaying: false }).action).toBe('idle');
  });

  it('asks for a tap once the retries are spent, or at once when the browser refused', () => {
    expect(watchdogPlan({ ...FINE, musicPlaying: false, attempts: WATCHDOG_MAX_ATTEMPTS - 1 }).action).toBe('recover');
    expect(watchdogPlan({ ...FINE, musicPlaying: false, attempts: WATCHDOG_MAX_ATTEMPTS }).action).toBe('ask-tap');
    expect(watchdogPlan({ ...FINE, musicPlaying: false, refused: true }).action).toBe('ask-tap');
    // once the music sounds again (a tap, or it came back), no tap is asked for
    expect(watchdogPlan({ ...FINE, refused: true, attempts: 9 }).action).toBe('ok');
  });

  it('brings the level back when the music is still low with no voice', () => {
    expect(watchdogPlan({ ...FINE, ducked: true, voiceAudible: false }).restoreLevel).toBe(true);
    expect(watchdogPlan({ ...FINE, ducked: true, voiceAudible: true }).restoreLevel).toBe(false);
    // even while the user pauses: the level must not stay low
    expect(watchdogPlan({ ...FINE, wanted: false, ducked: true }).restoreLevel).toBe(true);
  });

  it('waits longer at each retry, and keeps the last wait', () => {
    expect(retryDelayMs(0)).toBe(WATCHDOG_DELAYS_MS[0]);
    expect(retryDelayMs(1)).toBeGreaterThan(retryDelayMs(0));
    expect(retryDelayMs(99)).toBe(WATCHDOG_DELAYS_MS[WATCHDOG_DELAYS_MS.length - 1]);
    expect(retryDelayMs(-3)).toBe(WATCHDOG_DELAYS_MS[0]);
  });

  it('reads the context states', () => {
    expect(contextNeedsResume('interrupted')).toBe(true);
    expect(contextNeedsResume('suspended')).toBe(true);
    expect(contextNeedsResume('running')).toBe(false);
    expect(contextNeedsResume('closed')).toBe(false);
    expect(contextNeedsResume(null)).toBe(false);
  });

  it('treats a pause of the live element as unexpected only while the music is wanted', () => {
    expect(pauseIsUnexpected({ live: true, wanted: true })).toBe(true);
    expect(pauseIsUnexpected({ live: true, wanted: false })).toBe(false);
    expect(pauseIsUnexpected({ live: false, wanted: true })).toBe(false);
  });
});

describe('the music under the voice', () => {
  it('is lowered, never silenced, while a talk speaks, and back to the chosen level after', () => {
    const speaking = talkAudioReducer(TALK_IDLE, { type: 'playing' });
    expect(talkDucksMusic(speaking)).toBe(true);
    expect(musicGain({ volume: 0.4, muted: false, ducked: talkDucksMusic(speaking) })).toBeCloseTo(0.4 * DUCK_LEVEL);
    expect(musicGain({ volume: 0.4, muted: false, ducked: true })).toBeGreaterThan(0);
    for (const end of ['stopped'] as const) {
      const after = talkAudioReducer(speaking, { type: end });
      expect(musicGain({ volume: 0.4, muted: false, ducked: talkDucksMusic(after) })).toBeCloseTo(0.4);
    }
  });
});

describe('audio debug log', () => {
  it('is asked for only with audiodebug=1', () => {
    expect(audioDebugRequested('?audiodebug=1')).toBe(true);
    expect(audioDebugRequested('?x=2&audiodebug=1')).toBe(true);
    expect(audioDebugRequested('')).toBe(false);
    expect(audioDebugRequested('?audiodebug=0')).toBe(false);
  });

  it('keeps the last entries, the newest last', () => {
    let log = pushLogEntry([], { at: 0, text: 'a' });
    for (let i = 1; i < 20; i++) log = pushLogEntry(log, { at: i, text: String(i) });
    expect(log).toHaveLength(AUDIO_LOG_SIZE);
    expect(log[log.length - 1].text).toBe('19');
    expect(log[0].text).toBe(String(20 - AUDIO_LOG_SIZE));
  });

  it('writes the time to the millisecond', () => {
    expect(formatLogTime(new Date(2026, 10, 27, 9, 5, 3, 42).getTime())).toBe('09:05:03.042');
  });
});

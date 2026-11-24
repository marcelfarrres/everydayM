import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_SETTINGS,
  DUCK_LEVEL,
  TALK_IDLE,
  musicGain,
  parseMusicSettings,
  serializeMusicSettings,
  shuffleOrder,
  talkAudioReducer,
  talkDucksMusic,
  type TalkAudioEvent,
} from './mix';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('shuffleOrder', () => {
  it('plays every track once per pass', () => {
    const order = shuffleOrder(6, null, seeded(1));
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('never repeats the last track at the start of the next pass', () => {
    for (let seed = 0; seed < 300; seed++) {
      const random = seeded(seed);
      const first = shuffleOrder(4, null, random);
      const second = shuffleOrder(4, first.at(-1) ?? null, random);
      expect(second[0]).not.toBe(first.at(-1));
      expect([...second].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('copes with zero, one and two tracks', () => {
    expect(shuffleOrder(0, null)).toEqual([]);
    expect(shuffleOrder(1, 0)).toEqual([0]);
    for (let seed = 0; seed < 50; seed++) expect(shuffleOrder(2, 1, seeded(seed))).toEqual([0, 1]);
  });
});

describe('musicGain', () => {
  it('is the chosen volume, a quarter of it while a talk speaks, and zero when muted', () => {
    expect(musicGain({ volume: 0.8, muted: false, ducked: false })).toBeCloseTo(0.8);
    expect(musicGain({ volume: 0.8, muted: false, ducked: true })).toBeCloseTo(0.8 * DUCK_LEVEL);
    expect(DUCK_LEVEL).toBe(0.25);
    expect(musicGain({ volume: 0.8, muted: true, ducked: false })).toBe(0);
    expect(musicGain({ volume: 0.8, muted: true, ducked: true })).toBe(0);
  });

  it('keeps the level inside 0..1', () => {
    expect(musicGain({ volume: 3, muted: false, ducked: false })).toBe(1);
    expect(musicGain({ volume: -1, muted: false, ducked: false })).toBe(0);
    expect(musicGain({ volume: Number.NaN, muted: false, ducked: false })).toBe(DEFAULT_MUSIC_SETTINGS.volume);
  });
});

describe('talk ducking', () => {
  const run = (events: TalkAudioEvent[]) => events.reduce(talkAudioReducer, TALK_IDLE);

  it('ducks only while a talk is really playing with sound', () => {
    expect(talkDucksMusic(TALK_IDLE)).toBe(false);
    expect(talkDucksMusic(run([{ type: 'playing' }]))).toBe(true);
    expect(talkDucksMusic(run([{ type: 'playing' }, { type: 'stopped' }]))).toBe(false);
  });

  it('does not duck under a muted talk, and ducks again once it is unmuted', () => {
    const mutedTalk = run([{ type: 'volume', muted: true, volume: 1 }, { type: 'playing' }]);
    expect(talkDucksMusic(mutedTalk)).toBe(false);
    expect(talkDucksMusic(talkAudioReducer(mutedTalk, { type: 'volume', muted: false, volume: 1 }))).toBe(true);
    expect(talkDucksMusic(run([{ type: 'playing' }, { type: 'volume', muted: false, volume: 0 }]))).toBe(false);
  });

  it('comes back after a skip in the middle of a talk and after the next one ends', () => {
    const state = run([
      { type: 'playing' },
      { type: 'stopped' }, // skip: emptied
      { type: 'playing' }, // next talk
      { type: 'stopped' }, // ended
    ]);
    expect(talkDucksMusic(state)).toBe(false);
  });

  it('keeps the same state object when nothing changes', () => {
    const playing = run([{ type: 'playing' }]);
    expect(talkAudioReducer(playing, { type: 'playing' })).toBe(playing);
    expect(talkAudioReducer(TALK_IDLE, { type: 'stopped' })).toBe(TALK_IDLE);
  });
});

describe('music settings', () => {
  it('falls back to the defaults on missing or broken data', () => {
    expect(parseMusicSettings(null)).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(parseMusicSettings('')).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(parseMusicSettings('{not json')).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(parseMusicSettings('[1,2]')).toEqual(DEFAULT_MUSIC_SETTINGS);
    expect(parseMusicSettings('"loud"')).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  it('keeps each valid field and repairs the rest', () => {
    expect(parseMusicSettings('{"volume":0.3,"muted":true}')).toEqual({ volume: 0.3, muted: true });
    expect(parseMusicSettings('{"volume":"0.3","muted":true}')).toEqual({ volume: DEFAULT_MUSIC_SETTINGS.volume, muted: true });
    expect(parseMusicSettings('{"volume":7}')).toEqual({ volume: 1, muted: false });
    expect(parseMusicSettings('{"volume":-2,"muted":"yes"}')).toEqual({ volume: 0, muted: false });
  });

  it('round-trips', () => {
    const settings = { volume: 0.45, muted: true };
    expect(parseMusicSettings(serializeMusicSettings(settings))).toEqual(settings);
  });
});

/*
 * The pure rules of the player's sound, kept apart from the browser so they can be tested:
 * how loud the music is, how the playlist is shuffled, when a talk ducks the music, and how
 * the listener's choices are remembered.
 */

/** Music level while a talk is audible, as a share of the chosen volume. */
export const DUCK_LEVEL = 0.25;
/** Length of every fade (duck, restore, mute), in seconds. */
export const RAMP_SECONDS = 0.3;

export interface MusicSettings {
  volume: number; // 0..1
  muted: boolean;
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = { volume: 0.8, muted: false };

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The gain the music should reach: silence when muted, a quarter while a talk speaks. */
export function musicGain({ volume, muted, ducked }: MusicSettings & { ducked: boolean }): number {
  if (muted) return 0;
  const level = clampVolume(Number.isFinite(volume) ? volume : DEFAULT_MUSIC_SETTINGS.volume);
  return ducked ? level * DUCK_LEVEL : level;
}

/** Reads what was stored (anything broken falls back to the defaults, field by field). */
export function parseMusicSettings(raw: string | null | undefined): MusicSettings {
  if (!raw) return { ...DEFAULT_MUSIC_SETTINGS };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_MUSIC_SETTINGS };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...DEFAULT_MUSIC_SETTINGS };
  const row = value as Record<string, unknown>;
  const volume =
    typeof row.volume === 'number' && Number.isFinite(row.volume) ? clampVolume(row.volume) : DEFAULT_MUSIC_SETTINGS.volume;
  const muted = typeof row.muted === 'boolean' ? row.muted : DEFAULT_MUSIC_SETTINGS.muted;
  return { volume, muted };
}

export function serializeMusicSettings(settings: MusicSettings): string {
  return JSON.stringify({ volume: clampVolume(settings.volume), muted: settings.muted });
}

/**
 * A shuffled pass over `count` tracks (their indexes). `avoidFirst` is the track that just
 * played: it never opens the new pass, so the same song never plays twice in a row
 * (unless there is only one).
 */
export function shuffleOrder(count: number, avoidFirst: number | null, random: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === avoidFirst) {
    const swap = 1 + Math.floor(random() * (order.length - 1));
    [order[0], order[swap]] = [order[swap], order[0]];
  }
  return order;
}

/*
 * Ducking follows what the talk element really does, never what the UI intended: the music
 * goes down only while a talk is playing with sound, and anything that stops it (pause, end,
 * a skip that empties it, an error, mute) brings the music back.
 */
export interface TalkAudioState {
  playing: boolean;
  silent: boolean; // muted, or volume 0
}

export type TalkAudioEvent =
  | { type: 'playing' }
  | { type: 'stopped' } // pause, ended, emptied, abort, error, released
  | { type: 'volume'; muted: boolean; volume: number };

export const TALK_IDLE: TalkAudioState = { playing: false, silent: false };

export function talkAudioReducer(state: TalkAudioState, event: TalkAudioEvent): TalkAudioState {
  switch (event.type) {
    case 'playing':
      return state.playing ? state : { ...state, playing: true };
    case 'stopped':
      return state.playing ? { ...state, playing: false } : state;
    case 'volume': {
      const silent = event.muted || event.volume <= 0;
      return silent === state.silent ? state : { ...state, silent };
    }
  }
}

/** Whether the music should be ducked for this talk state. */
export function talkDucksMusic(state: TalkAudioState): boolean {
  return state.playing && !state.silent;
}

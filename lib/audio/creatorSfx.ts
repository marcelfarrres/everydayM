import { playSfx } from './sfx';
import type { SfxOneShot } from './sfxRecipes';

/*
 * The creator's sounds (phone: the start screen, the questions, the ending). No music plays there,
 * so the effects carry the mood and sit higher than in the workout. Every one is a cue here: which
 * sound it plays and its LEVEL, a multiplier over that sound's own level (sfxSamples.ts for the
 * recordings, sfxRecipes.ts for the synthesised ones), so the player's sounds stay as they are.
 * `gapMs`: a cue played again sooner than this is skipped (on top of the sound's own minGap), so
 * fast repeats never rattle. Levels set without listening (nobody has heard them yet): tune here.
 */

export interface CreatorCue {
  sound: SfxOneShot;
  /** over the sound's own level (1: as in the workout; at most SFX_GAIN_MAX) */
  level: number;
  gapMs?: number;
}

export const CREATOR_SFX = {
  // the first page: the crane holding the nose you write in creaks as the bar takes focus
  noseCreak: { sound: 'hookCreak', level: 1, gapMs: 800 },
  // the start screen's wheel
  wheelTick: { sound: 'drumClick', level: 1.6, gapMs: 60 },
  clampShut: { sound: 'towerDock', level: 1.5, gapMs: 250 },
  engineStart: { sound: 'engineStart', level: 1, gapMs: 500 },
  randomButton: { sound: 'buttonThunk', level: 1.4 },
  // the crew
  crewStep: { sound: 'metalStep', level: 1.6 },
  crewRung: { sound: 'ladderStep', level: 1.6 },
  crewLand: { sound: 'metalStep', level: 2.4, gapMs: 200 },
  crewBoard: { sound: 'metalStep', level: 2 },
  // the launch tower docking on the pad, ignition, lift-off
  gantryDock: { sound: 'towerDock', level: 1.6 },
  ignite: { sound: 'ignite', level: 1.5, gapMs: 300 },
  liftOff: { sound: 'launch', level: 1.2, gapMs: 600 },
  // the questions: the crane, the truck and its lift, the mechanics
  hookGrab: { sound: 'hookGrab', level: 1, gapMs: 200 },
  hookRelease: { sound: 'clack', level: 0.9 },
  truckIn: { sound: 'truckRoll', level: 1, gapMs: 600 },
  liftUp: { sound: 'liftWhir', level: 1, gapMs: 300 },
  dock: { sound: 'towerDock', level: 1.5, gapMs: 200 },
  bolt: { sound: 'clack', level: 1.5 },
  spark: { sound: 'spark', level: 1 },
  quickPiece: { sound: 'clack', level: 1.3 },
  // the minutes' tank: a small click as its level settles on each mark
  levelClick: { sound: 'drumClick', level: 1.4, gapMs: 50 },
  // the white screen
  veil: { sound: 'veilWhoosh', level: 1, gapMs: 1000 },
} as const satisfies Record<string, CreatorCue>;

export type CreatorCueName = keyof typeof CREATOR_SFX;

const lastAt = new Map<CreatorCueName, number>();

/** Plays a creator cue at its level (`gesture`: inside a tap, it may wake the sound up). */
export function creatorSfx(name: CreatorCueName, { gesture = false }: { gesture?: boolean } = {}): void {
  const cue: CreatorCue = CREATOR_SFX[name];
  if (typeof performance !== 'undefined' && cue.gapMs) {
    const now = performance.now();
    const last = lastAt.get(name);
    if (last !== undefined && now - last < cue.gapMs) return;
    lastAt.set(name, now);
  }
  playSfx(cue.sound, { gain: cue.level, gesture });
}

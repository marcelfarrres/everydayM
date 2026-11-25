import { parseIntentKeywords } from './keywords';

/*
 * The routine creator's jokes (phone only): when the user asks for too little, the creator teases
 * them once ("¿Tan poco tiempo tenemos?", "¿Tan poco hemos dormido hoy?") and lets the next send
 * through. Pure rules here; the look and the sound are in components/workout/CreatorJoke.tsx.
 *
 * At most one joke per routine creation, and never on a computer.
 */

export type CreatorJokeKind = 'time' | 'intensity';

/** What the user just sent in the creator. */
export type CreatorSend =
  /** the minutes question ("Seguir" under the slider) */
  | { kind: 'minutes'; minutes: number }
  /** an option of the intensity question (its difficulty: suave 4, media 6, alta 8) */
  | { kind: 'intensity'; difficulty: number }
  /** the sentence typed in the bar */
  | { kind: 'sentence'; prompt: string };

/** Fewer minutes than this is "too little time". */
export const JOKE_MINUTES_BELOW = 30;
/** A difficulty up to this one (media) is "too soft". */
export const JOKE_SOFT_UP_TO = 6;

// The difficulty the keyword parser gives when the sentence says nothing about it.
const UNSAID_DIFFICULTY = parseIntentKeywords('').difficulty;
// Medium said in words the parser leaves at its default ("intensidad media", "nivel 5").
const SAYS_MEDIUM = /\bintensidad\s+media\b|\b(?:nivel|intensidad|dificultad)\s*(?:de\s*)?5\b|\b5\s*\/\s*10\b/i;

/** The sentence's minutes, if it states any (local keyword parser: instant, no network). */
function sentenceMinutes(prompt: string): number | null {
  return parseIntentKeywords(prompt).targetMinutes;
}

/** Whether the sentence states a low or medium intensity (saying nothing is not soft). */
function sentenceIsSoft(prompt: string): boolean {
  const difficulty = parseIntentKeywords(prompt).difficulty;
  if (difficulty > JOKE_SOFT_UP_TO) return false;
  return difficulty !== UNSAID_DIFFICULTY || SAYS_MEDIUM.test(prompt);
}

/**
 * Which joke this send fires, or null (it goes through). `fired`: a joke already fired in this
 * routine creation; `phone`: below the desktop breakpoint.
 */
export function creatorJoke(send: CreatorSend, { fired, phone }: { fired: boolean; phone: boolean }): CreatorJokeKind | null {
  if (fired || !phone) return null;
  switch (send.kind) {
    case 'minutes':
      return send.minutes < JOKE_MINUTES_BELOW ? 'time' : null;
    case 'intensity':
      return send.difficulty <= JOKE_SOFT_UP_TO ? 'intensity' : null;
    case 'sentence': {
      const minutes = sentenceMinutes(send.prompt);
      if (minutes !== null && minutes < JOKE_MINUTES_BELOW) return 'time';
      return sentenceIsSoft(send.prompt) ? 'intensity' : null;
    }
  }
}

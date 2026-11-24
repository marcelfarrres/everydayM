/*
 * The one list of TikTok clip types. The Studio UI, its API routes, the export and the
 * caption/idea helpers all read it, so a new type is added here once.
 * Plain data on purpose: imported from client and server alike (no 'server-only').
 */

export interface ClipTypeInfo {
  id: string;
  name: string; // what the Studio shows
  description: string; // one line under the name
  promptHint: string; // how the idea prompt names it to Gemini
  implemented: boolean; // false: declared for later, never offered nor accepted
  needsRoutine: boolean; // true: made from a routine (the player's, or one the Studio builds)
  music: boolean; // true: rendered with a music bed (short clips get their sound in TikTok)
  length: string; // rough length shown next to the name ('' = depends on the routine)
}

export const CLIP_TYPES = [
  {
    id: 'summary',
    name: 'Resumen',
    description: 'Tu frase escribiéndose, tú, el plan y un vistazo a cada ejercicio.',
    promptHint: 'resumen 15 s',
    implemented: true,
    needsRoutine: true,
    music: false,
    length: '≈ 20 s',
  },
  {
    id: 'full',
    name: 'Rutina completa',
    description: 'Entera, para seguirla: reloj, bloques, descansos y lo siguiente. Con música.',
    promptHint: 'rutina completa',
    implemented: true,
    needsRoutine: true,
    music: true,
    length: '',
  },
  {
    id: 'top3',
    name: '3 ejercicios',
    description: '«3 ejercicios para…»: número grande, nombre y tiempo. Se guarda mucho.',
    promptHint: '3 ejercicios',
    implemented: true,
    needsRoutine: true,
    music: false,
    length: '≈ 16 s',
  },
  {
    id: 'challenge',
    name: 'Reto 1 minuto',
    description: '«Aguanta 1 minuto conmigo»: 3 ejercicios seguidos con reloj.',
    promptHint: 'reto 1 min',
    implemented: true,
    needsRoutine: true,
    music: false,
    length: '≈ 65 s',
  },
  {
    id: 'carousel',
    name: 'Carrusel de fotos',
    description: 'Portada, una foto por ejercicio y el plan. Para el modo foto de TikTok.',
    promptHint: 'fotos',
    implemented: true,
    needsRoutine: true,
    music: false,
    length: 'Fotos',
  },
  {
    id: 'talk',
    name: 'Vídeo hablado',
    description: 'Uno de tus vídeos hablados, con tu voz y el título del ejercicio.',
    promptHint: 'vídeo hablado',
    implemented: true,
    needsRoutine: false,
    music: false,
    length: '≈ 15 s',
  },
  {
    id: 'intro_talk',
    name: 'Intro + vídeo hablado',
    description: 'La entrada de siempre y después un vídeo hablado, con tu voz.',
    promptHint: 'intro y vídeo hablado',
    implemented: true,
    needsRoutine: false,
    music: false,
    length: '≈ 25 s',
  },
  {
    id: 'random_mix',
    name: 'Mezcla al azar',
    description: 'Ejercicios sueltos de la biblioteca, sin rutina.',
    promptHint: 'mezcla al azar',
    implemented: true,
    needsRoutine: false,
    music: false,
    length: '≈ 16 s',
  },
] as const satisfies readonly ClipTypeInfo[];

type ClipTypeEntry = (typeof CLIP_TYPES)[number];

/** Every declared id, implemented or not. */
export type AnyClipType = ClipTypeEntry['id'];
/** The ids the Studio can actually make today. */
export type ClipType = Extract<ClipTypeEntry, { implemented: true }>['id'];

const isImplemented = (entry: ClipTypeEntry): entry is Extract<ClipTypeEntry, { implemented: true }> =>
  entry.implemented;

/** Implemented types, in the order the Studio lists them. */
export const IMPLEMENTED_CLIP_TYPES: readonly ClipType[] = CLIP_TYPES.filter(isImplemented).map((t) => t.id);

/** Implemented types made from a routine: the ones the player's "···" menu offers. */
export const ROUTINE_CLIP_TYPES: readonly ClipType[] = CLIP_TYPES.filter(isImplemented)
  .filter((t) => t.needsRoutine)
  .map((t) => t.id);

export const DEFAULT_CLIP_TYPE: ClipType = 'summary';

export const CLIP_TYPE_NAMES = Object.fromEntries(CLIP_TYPES.map((t) => [t.id, t.name])) as Record<AnyClipType, string>;

export const CLIP_TYPE_DESCRIPTIONS = Object.fromEntries(CLIP_TYPES.map((t) => [t.id, t.description])) as Record<
  AnyClipType,
  string
>;

export const CLIP_TYPE_LENGTHS = Object.fromEntries(CLIP_TYPES.map((t) => [t.id, t.length])) as Record<AnyClipType, string>;

/** True only for implemented types: what an API should accept. */
export function isClipType(value: unknown): value is ClipType {
  return typeof value === 'string' && (IMPLEMENTED_CLIP_TYPES as readonly string[]).includes(value);
}

export function clipTypeInfo(type: AnyClipType): ClipTypeInfo {
  return CLIP_TYPES.find((t) => t.id === type) as ClipTypeInfo;
}

export function clipNeedsRoutine(type: AnyClipType): boolean {
  return clipTypeInfo(type).needsRoutine;
}

export function clipHasMusic(type: AnyClipType): boolean {
  return clipTypeInfo(type).music;
}

/** Types whose clip includes one of Marcel's vídeos hablados. */
export function clipNeedsTalk(type: AnyClipType): boolean {
  return type === 'talk' || type === 'intro_talk';
}

/** "summary (resumen 15 s), full (rutina completa) … o carousel (fotos)", for the idea prompt. */
export function clipTypesForPrompt(): string {
  const parts = CLIP_TYPES.filter(isImplemented).map((t) => `${t.id} (${t.promptHint})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} o ${parts[parts.length - 1]}` : parts.join('');
}

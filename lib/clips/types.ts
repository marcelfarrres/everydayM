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
}

export const CLIP_TYPES = [
  {
    id: 'summary',
    name: 'Resumen',
    description: 'Tu frase escribiéndose, tú, el plan y un vistazo a cada ejercicio.',
    promptHint: 'resumen 15 s',
    implemented: true,
  },
  {
    id: 'full',
    name: 'Rutina completa',
    description: 'Entera, para seguirla: reloj, vueltas, descansos y lo siguiente.',
    promptHint: 'rutina completa',
    implemented: true,
  },
  {
    id: 'top3',
    name: '3 ejercicios',
    description: '«3 ejercicios para…»: número grande, nombre y tiempo. Se guarda mucho.',
    promptHint: '3 ejercicios',
    implemented: true,
  },
  {
    id: 'challenge',
    name: 'Reto 1 minuto',
    description: '«Aguanta 1 minuto conmigo»: 3 ejercicios seguidos con reloj.',
    promptHint: 'reto 1 min',
    implemented: true,
  },
  {
    id: 'carousel',
    name: 'Carrusel de fotos',
    description: 'Portada, una foto por ejercicio y el plan. Para el modo foto de TikTok.',
    promptHint: 'fotos',
    implemented: true,
  },
  {
    id: 'talk',
    name: 'Vídeo hablado',
    description: 'Uno de tus vídeos hablados, con tu voz.',
    promptHint: 'vídeo hablado',
    implemented: false,
  },
  {
    id: 'intro_talk',
    name: 'Intro + vídeo hablado',
    description: 'La entrada de siempre y después un vídeo hablado.',
    promptHint: 'intro y vídeo hablado',
    implemented: false,
  },
  {
    id: 'random_mix',
    name: 'Mezcla al azar',
    description: 'Ejercicios sueltos de la biblioteca, sin rutina.',
    promptHint: 'mezcla al azar',
    implemented: false,
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

export const DEFAULT_CLIP_TYPE: ClipType = 'summary';

export const CLIP_TYPE_NAMES = Object.fromEntries(CLIP_TYPES.map((t) => [t.id, t.name])) as Record<AnyClipType, string>;

export const CLIP_TYPE_DESCRIPTIONS = Object.fromEntries(CLIP_TYPES.map((t) => [t.id, t.description])) as Record<
  AnyClipType,
  string
>;

/** True only for implemented types: what an API should accept. */
export function isClipType(value: unknown): value is ClipType {
  return typeof value === 'string' && (IMPLEMENTED_CLIP_TYPES as readonly string[]).includes(value);
}

/** "summary (resumen 15 s), full (rutina completa) … o carousel (fotos)", for the idea prompt. */
export function clipTypesForPrompt(): string {
  const parts = CLIP_TYPES.filter(isImplemented).map((t) => `${t.id} (${t.promptHint})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} o ${parts[parts.length - 1]}` : parts.join('');
}

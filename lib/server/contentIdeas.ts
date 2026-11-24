import 'server-only';
import { uniqueExercises } from '@/lib/routine';

/*
 * Help for posting every day with the least effort:
 *  - captionFor(): a ready-to-paste TikTok description (searchable words + a few hashtags)
 *    for each kind of video the Studio exports.
 *  - ideaForToday(): an idea for an organic clip Marcel records himself, with a shot list that
 *    takes a few minutes to film in one spot. Gemini writes it; a built-in bank covers failures.
 */

export type RoutineBrief = {
  focus: string; // "Piernas", "Full body"…
  minutes: number;
  rounds: number;
  perRound: number;
  exercises: string[]; // unique, in order
};

export type VideoKind = 'summary' | 'full' | 'top3' | 'challenge' | 'carousel';

const BASE_TAGS = ['#rutinaencasa', '#entrenamientoencasa', '#fitnessespaña', '#gymtok'];

function focusTag(focus: string): string {
  const slug = focus
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return slug && slug !== 'fullbody' ? `#${slug}` : '#fullbody';
}

/** Description to paste in TikTok: the words people search for first, then 4-5 hashtags. */
export function captionFor(kind: VideoKind, brief: RoutineBrief): string {
  const f = brief.focus.toLowerCase();
  const lines: Record<VideoKind, string> = {
    summary: `Rutina de ${f} en casa en ${brief.minutes} minutos, sin material. ${brief.rounds} vueltas de ${brief.perRound} ejercicios. La entera está en mi perfil. ¿La haces hoy?`,
    full: `Rutina completa de ${f} en casa · ${brief.minutes} min, hazla conmigo de principio a fin. Calentamiento + ${brief.rounds} vueltas. ¿Hasta qué vuelta llegas?`,
    top3: `3 ejercicios de ${f} que puedes hacer en casa sin material: ${brief.exercises.slice(0, 3).join(', ')}. ¿Cuál te cuesta más?`,
    challenge: `Reto de 1 minuto de ${f}: aguanta conmigo sin parar. ¿Lo has aguantado entero?`,
    carousel: `Rutina de ${f} en casa (${brief.minutes} min). Desliza para ver los ejercicios. ¿Con cuál empiezas?`,
  };
  return `${lines[kind]}\n\n${[focusTag(brief.focus), ...BASE_TAGS].join(' ')}`;
}

export type Idea = {
  title: string; // the idea in a few words
  hook: string; // text on screen in the first second
  why: string; // one line: why it should work
  shots: { seconds: number; what: string; text?: string }[]; // what to film, in order
  filmMinutes: number;
  caption: string;
  pairWith: VideoKind; // which app video to post the same day
};

/* ── built-in bank: works without Gemini ───────────────────────────────── */

function bank(b: RoutineBrief): Idea[] {
  const f = b.focus.toLowerCase();
  const [e1 = 'el primer ejercicio', e2 = 'el segundo', e3 = 'el tercero'] = b.exercises;
  const tags = [focusTag(b.focus), ...BASE_TAGS].join(' ');
  return [
    {
      title: 'Le pido la rutina a mi app',
      hook: `Le pido a mi app una rutina de ${f}`,
      why: 'Curiosidad: el público ve cómo nace la rutina y se queda a ver el resultado.',
      shots: [
        { seconds: 3, what: 'Tú mirando a cámara con el móvil en la mano', text: `Le pido a mi app una rutina de ${f}` },
        { seconds: 4, what: 'Pantalla del móvil escribiendo la frase (grabación de pantalla)' },
        { seconds: 5, what: 'Tú haciendo 2 repeticiones de ' + e1, text: 'Y esto es lo que me ha salido' },
      ],
      filmMinutes: 3,
      caption: `Le pedí a mi app una rutina de ${f} de ${b.minutes} min. ¿La hacemos? ${tags}`,
      pairWith: 'summary',
    },
    {
      title: 'El error que todos cometen',
      hook: `El error nº1 en ${e1}`,
      why: 'Los vídeos que corrigen errores se guardan y se comparten mucho.',
      shots: [
        { seconds: 3, what: `${e1} mal hecho, a cámara lenta`, text: 'Así NO' },
        { seconds: 4, what: `${e1} bien hecho, mismo plano`, text: 'Así SÍ' },
        { seconds: 3, what: 'Señalas a cámara', text: 'Rutina completa en mi perfil' },
      ],
      filmMinutes: 4,
      caption: `El error más común en ${e1} y cómo arreglarlo. ${tags}`,
      pairWith: 'top3',
    },
    {
      title: 'POV: solo tienes 20 minutos',
      hook: 'POV: solo tienes 20 minutos para entrenar',
      why: 'El POV conecta con la excusa más común y lleva a la rutina completa.',
      shots: [
        { seconds: 3, what: 'Miras el reloj, cara de prisa', text: 'POV: solo tienes 20 minutos' },
        { seconds: 3, what: 'Te quitas la sudadera de golpe' },
        { seconds: 5, what: `Cortes rápidos de ${e1}, ${e2} y ${e3}`, text: 'Esto es todo lo que necesitas' },
      ],
      filmMinutes: 4,
      caption: `POV: solo tienes 20 minutos. Rutina de ${f} sin material. ${tags}`,
      pairWith: 'full',
    },
    {
      title: 'Hazlo conmigo 1 minuto',
      hook: 'Aguanta 1 minuto conmigo',
      why: 'Los retos cortos se ven enteros y se repiten: mucho tiempo de visualización.',
      shots: [{ seconds: 60, what: `Plano fijo: ${e1}, ${e2} y ${e3}, 20 s cada uno, sin cortes`, text: 'No pares' }],
      filmMinutes: 2,
      caption: `Reto de 1 minuto. ¿Lo aguantas? Comenta cuando acabes. ${tags}`,
      pairWith: 'challenge',
    },
    {
      title: 'Mi rutina de hoy en 10 segundos',
      hook: `Mi rutina de ${f} de hoy`,
      why: 'Formato diario y reconocible: la gente vuelve a por el de mañana.',
      shots: [
        { seconds: 2, what: 'Saludo rápido a cámara', text: `Día ${new Date().getDate()} · ${b.focus}` },
        { seconds: 8, what: `1 segundo de cada ejercicio: ${b.exercises.slice(0, 6).join(', ')}` },
      ],
      filmMinutes: 3,
      caption: `Rutina de hoy: ${f}, ${b.minutes} min. Mañana otra distinta. ${tags}`,
      pairWith: 'summary',
    },
    {
      title: 'Antes de entrenar',
      hook: 'Lo que hago 5 minutos antes de entrenar',
      why: 'Contenido de rutina personal: genera comentarios y seguidores.',
      shots: [
        { seconds: 3, what: 'Te atas las zapatillas', text: 'Lo que hago antes de entrenar' },
        { seconds: 3, what: 'Bebes agua' },
        { seconds: 4, what: 'Un ejercicio de movilidad del calentamiento', text: 'Y empezamos' },
      ],
      filmMinutes: 3,
      caption: `Mi ritual antes de entrenar ${f}. ¿Cuál es el tuyo? ${tags}`,
      pairWith: 'full',
    },
  ];
}

/* ── Gemini ───────────────────────────────────────────────────────────── */

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    hook: { type: 'STRING' },
    why: { type: 'STRING' },
    shots: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { seconds: { type: 'NUMBER' }, what: { type: 'STRING' }, text: { type: 'STRING' } },
        required: ['seconds', 'what'],
      },
    },
    filmMinutes: { type: 'NUMBER' },
    caption: { type: 'STRING' },
    pairWith: { type: 'STRING', enum: ['summary', 'full', 'top3', 'challenge', 'carousel'] },
  },
  required: ['title', 'hook', 'why', 'shots', 'filmMinutes', 'caption', 'pairWith'],
};

function prompt(b: RoutineBrief, avoid: string[]): string {
  return `Eres el guionista de TikTok de Marcel, entrenador que publica cada día rutinas en casa sin material (España, público hispanohablante).
Hoy su app ha creado esta rutina: ${b.focus}, ${b.minutes} min, ${b.rounds} vueltas de ${b.perRound} ejercicios: ${b.exercises.join(', ')}.
Propón UNA idea de vídeo orgánico que él grabe solo, con el móvil en un trípode en un mismo sitio, en menos de 5 minutos de grabación.
Reglas: gancho de texto para el primer segundo (máx. 8 palabras), 1 a 4 tomas cortas (total 7-30 s; un reto puede durar 60 s), texto en pantalla breve, descripción con palabras que la gente busca + 4-5 hashtags en español. Nada de música con derechos. Escribe en español de España, cercano y directo.
${avoid.length ? `No repitas estas ideas: ${avoid.join(' | ')}.` : ''}
pairWith = el vídeo de su app que conviene publicar ese mismo día: summary (resumen 15 s), full (rutina completa), top3 (3 ejercicios), challenge (reto 1 min) o carousel (fotos).`;
}

export async function ideaForToday(b: RoutineBrief, avoid: string[] = []): Promise<{ idea: Idea; source: 'gemini' | 'bank' }> {
  const fallback = () => {
    const ideas = bank(b).filter((i) => !avoid.includes(i.title));
    const pool = ideas.length ? ideas : bank(b);
    return { idea: pool[Math.floor(Math.random() * pool.length)], source: 'bank' as const };
  };
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return fallback();
  const raw = process.env.GEMINI_MODEL?.trim();
  const model = raw && /^[\w.-]+$/.test(raw) ? raw : 'gemini-flash-lite-latest';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt(b, avoid) }] }],
        generationConfig: { temperature: 1, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback();
    const idea = JSON.parse(text) as Idea;
    if (!idea.title || !Array.isArray(idea.shots) || idea.shots.length === 0) return fallback();
    idea.shots = idea.shots.slice(0, 5).map((s) => ({ seconds: Math.max(1, Math.round(Number(s.seconds) || 3)), what: String(s.what).slice(0, 200), text: s.text ? String(s.text).slice(0, 80) : undefined }));
    idea.filmMinutes = Math.max(1, Math.min(10, Math.round(Number(idea.filmMinutes) || 3)));
    return { idea, source: 'gemini' };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export function briefFrom(meta: { focusLabel?: string; totalSeconds?: number; rounds?: number; exercisesPerRound?: number; blocks?: { id: string; title: string }[][] }): RoutineBrief {
  const exercises = uniqueExercises(meta).map((e) => e.title);
  return {
    focus: meta.focusLabel || 'Full body',
    minutes: Math.max(1, Math.round((meta.totalSeconds ?? 0) / 60)),
    rounds: meta.rounds ?? 1,
    perRound: meta.exercisesPerRound ?? exercises.length,
    exercises,
  };
}

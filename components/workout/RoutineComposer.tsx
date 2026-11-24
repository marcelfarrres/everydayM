'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, ChevronLeft, Mic, Play, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildRoutine, uniqueExercises } from '@/lib/routine';
import { parseIntentKeywords, parseRounds } from '@/lib/intent/keywords';
import { MUSCLE_LABELS_ES, type RoutineIntentResponse } from '@/lib/intent/types';
import { MinutesSlider } from '@/components/workout/MinutesSlider';
import { MarcelFigure } from '@/components/workout/MarcelFigure';
import { Hilo } from '@/components/workout/player/Hilo';
import type {
  Exercise,
  MuscleId,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
} from '@/types/workout';

const MIN_MINUTES = 20;
const MAX_MINUTES = 40;
const MINUTE_OPTIONS = [20, 25, 30, 35, 40];
const INTENSITY_OPTIONS = [
  { label: 'suave', difficulty: 4 },
  { label: 'media', difficulty: 6 },
  { label: 'alta', difficulty: 8 },
];
const EXAMPLES = [
  'Full body, 30 minutos',
  'Hombros, 20 minutos',
  'Piernas intenso, 40 minutos',
];
const GROUPS: { label: string; ids: MuscleId[] }[] = [
  { label: 'hombros', ids: ['hombros'] },
  { label: 'brazos', ids: ['biceps', 'triceps', 'antebrazos'] },
  { label: 'pecho', ids: ['pectorales'] },
  { label: 'espalda', ids: ['trapecio', 'dorsales', 'lumbares'] },
  { label: 'core', ids: ['abdominales', 'oblicuos'] },
  { label: 'piernas', ids: ['cuadriceps', 'aductores', 'isquiotibiales', 'gemelos'] },
  { label: 'glúteos', ids: ['gluteos'] },
];
// ms each build step stays on screen: thinking → minutes → muscles → exercises → ready
// ms each build step stays on screen: thinking → minutes → muscles → exercises → ready
// stage 1: the clip (Marcel leaves in street clothes, comes back ready), then the laser paints the muscles
const STEP_MS = [200, 1900, 300, 1500];
const CLIP = { src: '/marcel-ready.mp4', poster: '/marcel-ready-poster.webp' };
const SCAN = { duration: 1.7, ease: [0.65, 0, 0.35, 1] } as const;
const CAPTIONS = ['Creando tu rutina', 'Tiempo', 'Músculos', 'Ejercicios', ''];
const EASE = [0.16, 1, 0.3, 1] as const;

type GroupRole = 'primary' | 'secondary' | 'off';

// Follow-up questions, only when the sentence leaves the routine open (no time given).
// At most three, one tap each; what the user already said is never asked again.
type Question = { id: string; title: string; options: { label: string; patch: Partial<RoutineIntent> }[] };
const Q_MINUTES: Question = {
  id: 'minutes',
  title: '¿Cuánto tiempo tienes?',
  options: MINUTE_OPTIONS.map((m) => ({ label: `${m} min`, patch: { targetMinutes: m } })),
};
const Q_ROUNDS: Question = {
  id: 'rounds',
  title: '¿Cuántos bloques?',
  options: [
    { label: '2 bloques', patch: { rounds: 2 } },
    { label: '3 bloques', patch: { rounds: 3 } },
    { label: '4 bloques', patch: { rounds: 4 } },
    { label: 'Las que encajen', patch: { rounds: null } },
  ],
};
const Q_INTENSITY: Question = {
  id: 'intensity',
  title: '¿A qué intensidad?',
  options: INTENSITY_OPTIONS.map((o) => ({
    label: o.label[0].toUpperCase() + o.label.slice(1),
    patch: { difficulty: o.difficulty, slotSeconds: null },
  })),
};
const SAYS_INTENSITY =
  /suave|tranquil|f[aá]cil|liger|relaj|intens|\bdur[oa]\b|fuerte|a tope|ca[ñn]er|\bmedi[oa]\b|moderad|reventar/i;

function questionsFor(prompt: string): Question[] {
  if (parseIntentKeywords(prompt).targetMinutes !== null) return [];
  return [
    Q_MINUTES,
    ...(parseRounds(prompt) === null ? [Q_ROUNDS] : []),
    ...(SAYS_INTENSITY.test(prompt) ? [] : [Q_INTENSITY]),
  ];
}
type Tray = 'minutes' | 'focus' | 'intensity' | null;
type Built = { queue: RoutineItem[]; meta: RoutineMeta };

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const subscribeNoop = () => () => {};

function groupRole(intent: RoutineIntent, ids: MuscleId[]): GroupRole {
  const hits = intent.muscles.filter((m) => ids.includes(m.id));
  if (hits.some((m) => m.role === 'primary')) return 'primary';
  return hits.length > 0 ? 'secondary' : 'off';
}

function focusParts(intent: RoutineIntent): { fullBody: boolean; names: string[] } {
  const primary = intent.muscles.filter((m) => m.role === 'primary');
  const active = GROUPS.filter((g) => groupRole(intent, g.ids) !== 'off');
  const primaryGroups = GROUPS.filter(
    (g) => groupRole(intent, g.ids) === 'primary',
  );
  // few muscles: name them exactly ("hombros"), otherwise speak in groups
  const names =
    primary.length > 0 && primary.length <= 2
      ? primary.map((m) => MUSCLE_LABELS_ES[m.id])
      : (primaryGroups.length > 0 ? primaryGroups : active).map((g) => g.label);

  if (active.length >= 6) {
    return {
      fullBody: true,
      names: primaryGroups.length > 0 && primaryGroups.length <= 3 ? names : [],
    };
  }
  return { fullBody: false, names };
}

/** "3 bloques de 4 series" */
function blocksAndSeries(blocks: number, series: number): string {
  return `${blocks} ${blocks === 1 ? 'bloque' : 'bloques'} de ${series} ${series === 1 ? 'serie' : 'series'}`;
}

function intensityLabel(difficulty: number): string {
  return difficulty <= 4 ? 'suave' : difficulty <= 6 ? 'media' : 'alta';
}

async function resolveIntent(text: string): Promise<RoutineIntent> {
  try {
    const response = await fetch('/api/routine-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 500) }),
    });
    if (response.ok) {
      const data = (await response.json()) as RoutineIntentResponse;
      if (data?.intent && Array.isArray(data.intent.muscles)) return data.intent;
    }
  } catch {
    // offline or quota: the local keyword parser below covers it
  }
  return parseIntentKeywords(text);
}

interface RoutineComposerProps {
  onStart: (queue: RoutineItem[], meta: RoutineMeta, intent: RoutineIntent, prompt: string) => void;
  onOpenStudio?: () => void; // only where the Studio is switched on
}

export function RoutineComposer({ onStart, onOpenStudio }: RoutineComposerProps) {
  const reducedMotion = useReducedMotion();
  const [view, setView] = useState<'ask' | 'questions' | 'result'>('ask');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Partial<RoutineIntent>>({});
  const [asked, setAsked] = useState(0); // questions answered so far
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(30);
  const [clipDone, setClipDone] = useState(false);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [intent, setIntent] = useState<RoutineIntent | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [stage, setStage] = useState(0); // 0 thinking · 1 minutes · 2 muscles · 3 exercises · 4 ready
  const [tray, setTray] = useState<Tray>(null);

  const exercisesRef = useRef<Promise<Exercise[]> | null>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const exerciseListRef = useRef<Exercise[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const intentRef = useRef<Promise<RoutineIntent> | null>(null);

  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(getSpeechRecognition()),
    () => false,
  );

  const loadExercises = useCallback(() => {
    if (!exercisesRef.current) {
      exercisesRef.current = Promise.resolve(
        supabase.from('exercises').select('*'),
      ).then(({ data, error: dbError }) => {
        if (dbError) throw dbError;
        exerciseListRef.current = (data ?? []) as Exercise[];
        setLibrary(exerciseListRef.current);
        return exerciseListRef.current;
      });
      exercisesRef.current.catch(() => {
        exercisesRef.current = null; // let the next attempt retry
      });
    }
    return exercisesRef.current;
  }, []);

  // Warm the exercise cache so the routine builds instantly.
  useEffect(() => {
    loadExercises().catch(() => {});
  }, [loadExercises]);

  // Ready to type on a computer; on a phone the keyboard waits for a tap (it would cover Marcel).
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) document.getElementById('routine-prompt')?.focus();
  }, []);

  const minutes = built ? Math.round(built.meta.totalSeconds / 60) : 0;
  const ready = stage >= 4;

  // Build sequence: each step holds for its beat, then hands over to the next.
  useEffect(() => {
    if (view !== 'result' || !built || stage >= 4) return;
    if (stage === 1 && !clipDone) return; // the scan starts on the clip's last frame
    const timer = setTimeout(
      () => setStage((s) => (reducedMotion ? 4 : s + 1)),
      reducedMotion ? 0 : STEP_MS[stage],
    );
    return () => clearTimeout(timer);
  }, [view, built, stage, clipDone, reducedMotion]);

  // Minutes count up (1, 2, 3… 20) and re-count when the routine is retouched.
  const counting = stage >= 1;
  useEffect(() => {
    const node = minutesRef.current;
    if (!counting || !node) return;
    const from = Number(node.textContent) || 0;
    const controls = animate(from, minutes, {
      duration: reducedMotion ? 0 : 1,
      ease: 'easeOut',
      onUpdate: (value) => {
        node.textContent = String(Math.round(value));
      },
    });
    return () => controls.stop();
  }, [counting, minutes, reducedMotion]);

  const submit = (raw: string) => {
    const prompt = raw.trim();
    if (!prompt) return;
    recognitionRef.current?.stop();
    setError('');
    setText(prompt);
    // Gemini reads the sentence while the user answers, so nobody waits for it.
    intentRef.current = resolveIntent(prompt).then((parsed) => ({
      ...parsed,
      rounds: parseRounds(prompt) ?? parsed.rounds ?? null,
    }));
    const pending = questionsFor(prompt);
    if (pending.length > 0) {
      setQuestions(pending);
      setAnswers({});
      setAsked(0);
      setView('questions');
      return;
    }
    void build({});
  };

  const answer = (patch: Partial<RoutineIntent>) => {
    const next = { ...answers, ...patch };
    setAnswers(next);
    setAsked(asked + 1);
    if (asked + 1 >= questions.length) void build(next);
  };

  const build = async (extra: Partial<RoutineIntent>) => {
    setBuilt(null);
    setTray(null);
    setStage(0);
    setView('result');

    const clip = clipRef.current;
    setClipDone(false);
    if (clip && !reducedMotion) {
      clip.currentTime = 0;
      clip.play().catch(() => setClipDone(true));
    } else {
      setClipDone(true);
    }

    try {
      const [list, parsed] = await Promise.all([
        loadExercises(),
        intentRef.current ?? resolveIntent(text),
      ]);
      if (list.length === 0) {
        setError('Todavía no hay vídeos subidos. Añádelos desde el estudio.');
        backToAsk();
        return;
      }
      const merged = { ...parsed, ...extra };
      const next: RoutineIntent = {
        ...merged,
        targetMinutes: Math.min(
          MAX_MINUTES,
          Math.max(MIN_MINUTES, merged.targetMinutes ?? 30),
        ),
      };
      setIntent(next);
      setBuilt(buildRoutine(list, next));
    } catch {
      setError('No he podido crear la rutina. Revisa la conexión e inténtalo otra vez.');
      backToAsk();
    }
  };

  const backToAsk = () => {
    const clip = clipRef.current;
    if (clip) {
      clip.pause();
      clip.currentTime = 0; // back to the still first frame
    }
    setClipDone(false);
    setView('ask');
  };

  /** The routine these minutes would give, as "3 bloques de 5 series" (fixed seed: no reshuffle while dragging). */
  const shapeFor = (minutes: number, base?: RoutineIntent | null) => {
    const list = library;
    if (list.length === 0) return undefined;
    const intent = base ?? { ...parseIntentKeywords(text), rounds: parseRounds(text) };
    const { meta } = buildRoutine(list, { ...intent, targetMinutes: minutes }, () => 0.42);
    // Before the rounds are chosen only the total is certain.
    return base?.rounds || parseRounds(text)
      ? blocksAndSeries(meta.rounds, meta.exercisesPerRound)
      : `≈ ${meta.rounds * meta.exercisesPerRound} series en total`;
  };

  const retouch = (next: RoutineIntent) => {
    setIntent(next);
    setBuilt(buildRoutine(exerciseListRef.current, next));
  };

  const cycleGroup = (ids: MuscleId[]) => {
    if (!intent) return;
    const role = groupRole(intent, ids);
    const rest = intent.muscles.filter((m) => !ids.includes(m.id));
    const added =
      role === 'off'
        ? ids.map((id) => ({ id, role: 'primary' as const, weight: 1 }))
        : role === 'primary'
          ? ids.map((id) => ({ id, role: 'secondary' as const, weight: 0.6 }))
          : [];
    const muscles = [...rest, ...added];
    if (muscles.length === 0) return; // a routine needs at least one muscle
    if (!muscles.some((m) => m.role === 'primary')) {
      muscles[0] = { ...muscles[0], role: 'primary', weight: 1 };
    }
    retouch({ ...intent, muscles });
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      setText(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(' ')
          .trim(),
      );
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  // One accent only: the muscle is red, like on Marcel. Everything else is ink on paper.
  const focusRing =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
  const tokenClass = `whitespace-nowrap rounded-md font-semibold underline decoration-2 underline-offset-[0.22em] transition-colors ${focusRing}`;
  const inkToken = `${tokenClass} text-ink decoration-ink/25 hover:decoration-ink`;
  const focus = intent ? focusParts(intent) : { fullBody: false, names: [] };
  const focusToken = (label: string) => (
    <button
      type="button"
      aria-expanded={tray === 'focus'}
      onClick={() => setTray(tray === 'focus' ? null : 'focus')}
      className={`${tokenClass} text-[#e3271b] decoration-[#e3271b]/35 hover:decoration-[#e3271b]`}
    >
      {label}
    </button>
  );
  const pillClass = (active: boolean) =>
    `min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${focusRing} ${
      active ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-white/70'
    }`;
  // The clip ends on the very photo the muscles are painted on, so the laser only adds colour.
  const scanned = view === 'result' && stage >= 1 && clipDone;
  const scanning = scanned && stage === 1;

  return (
    <div className="relative isolate flex min-h-dvh w-full flex-col bg-paper font-[family-name:var(--font-display)] text-ink selection:bg-ink selection:text-white lg:flex-row">
      <header className="absolute inset-x-0 top-0 z-10 box-content flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        {view !== 'ask' ? (
          <button
            type="button"
            onClick={backToAsk}
            className={`-ml-2 flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 text-[15px] font-medium text-ink/75 hover:text-ink ${focusRing}`}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            Cambiar
          </button>
        ) : (
          <span className="text-lg font-bold tracking-tight">Everyday M</span>
        )}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            aria-label="Estudio y modo avanzado"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-ink/65 hover:bg-ink/10 hover:text-ink ${focusRing}`}
          >
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </header>

      {/* Marcel in street clothes; on create he comes back ready for the gym, and a scan line paints the muscles */}
      <div
        onClick={() => {
          if (built && !ready) {
            setClipDone(true);
            setStage(4);
          }
        }}
        className={`media-feather relative mx-auto aspect-[9/16] shrink-0 overflow-hidden transition-[height] duration-500 lg:mx-0 lg:h-dvh ${view === 'questions' ? 'h-[30dvh]' : 'h-[52dvh]'}`}
      >
        <motion.div
          initial={false}
          animate={{ scale: scanning && !reducedMotion ? 1.06 : 1 }}
          transition={{ duration: SCAN.duration, ease: SCAN.ease }}
          className="absolute inset-0 origin-[50%_35%]"
        >
          <video
            ref={clipRef}
            src={CLIP.src}
            poster={CLIP.poster}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onEnded={() => setClipDone(true)}
            onError={() => setClipDone(true)}
            className="absolute inset-0 h-full w-full object-cover grayscale brightness-[1.06] contrast-[1.04]"
          />
          <motion.div
            initial={false}
            animate={{ clipPath: scanned ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }}
            transition={reducedMotion ? { duration: 0 } : SCAN}
            className="absolute inset-0"
          >
            <MarcelFigure variant="scene" muscles={built ? built.meta.muscles : []} className="h-full w-full" />
          </motion.div>
          {!reducedMotion && (
            <motion.div
              aria-hidden="true"
              initial={false}
              animate={{ top: scanned ? '100%' : '0%', opacity: scanned ? [0, 1, 1, 0] : 0 }}
              transition={SCAN}
              className="absolute inset-x-0 h-0.5 bg-heat shadow-[0_0_28px_8px_rgba(255,59,48,0.55)]"
            />
          )}
        </motion.div>
      </div>

      {view === 'ask' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 pb-8 sm:px-8 lg:px-16"
        >
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-balance text-[clamp(2.5rem,10vw,5rem)] font-semibold leading-[0.98] tracking-[-0.035em]"
          >
            ¿Qué entrenamos hoy?
          </motion.h1>

          <div className="flex items-end gap-2 rounded-[28px] bg-white p-2 pl-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
            <label htmlFor="routine-prompt" className="sr-only">
              Describe tu rutina
            </label>
            <textarea
              id="routine-prompt"
              rows={1}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              placeholder="Hombros, 20 minutos"
              className="field-sizing-content max-h-40 min-h-12 flex-1 resize-none bg-transparent py-3 text-lg font-medium text-ink caret-ink placeholder:text-ink/50 focus:outline-none"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={listening}
                aria-label={listening ? 'Parar de escuchar' : 'Dictar por voz'}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${focusRing} ${
                  listening
                    ? 'animate-pulse bg-heat text-white'
                    : 'text-ink/70 hover:bg-ink/10 hover:text-ink'
                }`}
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Crear rutina"
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-[transform,opacity] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 ${focusRing}`}
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submit(example)}
                className={`min-h-11 rounded-full bg-ink/8 px-4 text-[15px] font-medium text-ink/85 hover:bg-ink/15 hover:text-ink ${focusRing}`}
              >
                {example}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="text-[15px] font-medium text-[#c41f14]">
              {error}
            </p>
          )}
        </form>
      ) : view === 'questions' ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-5 pb-8 sm:px-8 lg:px-16">
          <div className="flex items-center justify-between gap-4">
            <p className="truncate text-[17px] font-medium text-ink/55">«{text}»</p>
            <div aria-hidden="true" className="flex shrink-0 gap-1.5">
              {questions.map((q, i) => (
                <span
                  key={q.id}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i < asked ? 'w-6 bg-ink' : i === asked ? 'w-6 bg-heat' : 'w-3 bg-ink/15'
                  }`}
                />
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {questions
              .filter((_, i) => i === asked)
              .map((q) => (
                <motion.div
                  key={q.id}
                  initial={reducedMotion ? false : { opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, x: -40 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="flex flex-col gap-6"
                >
                  <h1 className="text-balance text-[clamp(2.25rem,8vw,4rem)] font-semibold leading-[1] tracking-[-0.035em]">
                    {q.title}
                  </h1>
                  {q.id === 'minutes' ? (
                    <div className="flex flex-col gap-6">
                      <MinutesSlider value={draftMinutes} onChange={setDraftMinutes} preview={shapeFor(draftMinutes)} />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => answer({ targetMinutes: draftMinutes })}
                        className={`flex h-16 items-center justify-center rounded-full bg-ink text-xl font-semibold text-white ${focusRing}`}
                      >
                        Seguir
                      </motion.button>
                    </div>
                  ) : (
                  <div className={`grid gap-2.5 sm:flex sm:flex-wrap ${q.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {q.options.map((option, i) => (
                      <motion.button
                        key={option.label}
                        type="button"
                        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + i * 0.05, duration: 0.4, ease: EASE }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => answer(option.patch)}
                        className={`min-h-16 rounded-3xl bg-white px-6 text-xl font-semibold shadow-[0_14px_30px_-22px_rgba(0,0,0,0.4)] transition-colors hover:bg-ink hover:text-white ${focusRing}`}
                      >
                        {option.label}
                      </motion.button>
                    ))}
                  </div>
                  )}
                </motion.div>
              ))}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => void build(answers)}
            className={`self-start rounded-full text-[15px] font-medium text-ink/55 underline decoration-ink/25 underline-offset-4 hover:text-ink ${focusRing}`}
          >
            Saltar, decide tú
          </button>
        </div>
      ) : (
        <div
          onClick={() => {
            if (built && !ready) {
              setClipDone(true);
              setStage(4); // tap anywhere to skip the build
            }
          }}
          className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-5 pb-8 sm:px-8 lg:px-16"
        >
          <div>
            <p aria-live="polite" className="h-6 text-[15px] font-medium text-ink/60">
              {scanned && stage === 1 ? CAPTIONS[2] : CAPTIONS[stage]}
            </p>
            <button
              type="button"
              disabled={!ready}
              aria-expanded={tray === 'minutes'}
              aria-label={`Duración: ${minutes} minutos. Cambiar`}
              onClick={() => {
                setDraftMinutes(intent?.targetMinutes ?? 30);
                setTray(tray === 'minutes' ? null : 'minutes');
              }}
              className={`flex items-baseline gap-2 rounded-2xl leading-none ${focusRing} ${
                stage === 0 ? 'animate-pulse text-ink/25' : 'text-ink'
              }`}
            >
              <span
                ref={minutesRef}
                className="text-[clamp(5rem,22vw,8rem)] font-bold tabular-nums tracking-[-0.05em]"
              >
                0
              </span>
              <span className="text-3xl font-semibold text-ink/55">min</span>
            </button>
            {ready && built && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex max-w-sm flex-col gap-3"
              >
                <p className="text-xl font-semibold tabular-nums text-ink/70">
                  {blocksAndSeries(built.meta.rounds, built.meta.exercisesPerRound)}
                </p>
                {/* the same hilo the player's bar draws, every serie still to do */}
                <Hilo surface="light" blocks={built.meta.blocks.map((block) => block.map(() => 'todo' as const))} />
              </motion.div>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {stage === 3 && built && (
              <motion.ul
                key="exercises"
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="flex min-h-36 flex-wrap content-start gap-2"
              >
                {uniqueExercises(built.meta).map((exercise, index) => (
                  <motion.li
                    key={exercise.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.09, duration: 0.4, ease: EASE }}
                    className="rounded-full bg-white px-3.5 py-2 text-[15px] font-medium"
                  >
                    {exercise.title}
                  </motion.li>
                ))}
              </motion.ul>
            )}

            {ready && built && intent && (
              <motion.div
                key="ready"
                initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="flex flex-col gap-5"
              >
                <h1 className="text-pretty text-[clamp(1.75rem,7vw,2.5rem)] font-medium leading-[1.3] tracking-[-0.02em] text-ink/55">
                  Hoy,{' '}
                  {focus.fullBody && focusToken('full body')}
                  {focus.fullBody && focus.names.length > 0 && ' con foco en '}
                  {focus.names.map((name, index) => (
                    <Fragment key={name}>
                      {index > 0 && (index === focus.names.length - 1 ? ' y ' : ', ')}
                      {focusToken(name)}
                    </Fragment>
                  ))}
                  , a intensidad{' '}
                  <button
                    type="button"
                    aria-expanded={tray === 'intensity'}
                    onClick={() => setTray(tray === 'intensity' ? null : 'intensity')}
                    className={inkToken}
                  >
                    {intensityLabel(intent.difficulty)}
                  </button>{' '}
                  y{' '}
                  <button
                    type="button"
                    aria-pressed={intent.includeWarmup}
                    onClick={() => retouch({ ...intent, includeWarmup: !intent.includeWarmup })}
                    className={inkToken}
                  >
                    {intent.includeWarmup ? 'con' : 'sin'} calentamiento
                  </button>
                  .
                </h1>

                {tray && (
                  <div className="flex flex-wrap gap-2">
                    {tray === 'minutes' && (
                      <div className="w-full rounded-3xl bg-white p-5">
                        <MinutesSlider
                          value={draftMinutes}
                          onChange={setDraftMinutes}
                          onCommit={(m) => retouch({ ...intent, targetMinutes: m })}
                          preview={shapeFor(draftMinutes, intent)}
                        />
                      </div>
                    )}
                    {tray === 'intensity' &&
                      INTENSITY_OPTIONS.map((option) => {
                        const active = intensityLabel(intent.difficulty) === option.label;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              retouch({ ...intent, difficulty: option.difficulty, slotSeconds: null })
                            }
                            className={pillClass(active)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    {tray === 'focus' &&
                      GROUPS.map((group) => {
                        const role = groupRole(intent, group.ids);
                        return (
                          <button
                            key={group.label}
                            type="button"
                            aria-label={`${group.label}: ${
                              role === 'primary' ? 'a tope' : role === 'secondary' ? 'de apoyo' : 'fuera'
                            }`}
                            onClick={() => cycleGroup(group.ids)}
                            className={`min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${focusRing} ${
                              role === 'primary'
                                ? 'bg-heat text-white'
                                : role === 'secondary'
                                  ? 'bg-heat/25 text-ink'
                                  : 'bg-white text-ink/75 hover:bg-white/70'
                            }`}
                          >
                            {group.label}
                          </button>
                        );
                      })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onStart(built.queue, built.meta, intent, text)}
                  className={`flex h-16 items-center justify-center gap-3 rounded-full bg-ink text-xl font-semibold text-white shadow-[0_22px_40px_-22px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${focusRing}`}
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  Empezar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

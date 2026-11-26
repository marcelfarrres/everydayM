'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, ChevronLeft, Mic, Play, SlidersHorizontal } from 'lucide-react';
import { fetchExercises, fetchRests } from '@/lib/data/exercises';
import { buildRoutine, recentExerciseIds, uniqueExercises } from '@/lib/routine';
import { parseExercisesPerRound, parseIntentKeywords, parseRounds } from '@/lib/intent/keywords';
import { MUSCLE_LABELS_ES, type RoutineIntentResponse } from '@/lib/intent/types';
import { MinutesSlider } from '@/components/workout/MinutesSlider';
import { MarcelFigure } from '@/components/workout/MarcelFigure';
import { Hilo } from '@/components/workout/player/Hilo';
import { useRocketWidth } from '@/components/workout/player/hooks';
import { CREATOR, ChoiceRocket, LaunchRocket, RiseIn, WaitingRocket, launchRocket } from '@/components/workout/CreatorRocket';
import { HOP, riseKeyframes, waitingEngine } from '@/components/workout/rocketFlight';
import { launchedUntil } from '@/components/workout/rocketHandoff';
import { barLines } from '@/components/workout/rocketShape';
import { PadRocket } from '@/components/workout/PadRocket';
import { PAD_BAR, fitLabel, padBarLayout } from '@/components/workout/padRocketShape';
import { LaunchBase, useTextMeasure } from '@/components/workout/LaunchBase';
import { Porthole } from '@/components/workout/Porthole';
import { standInExercise } from '@/lib/intent/standIn';
import { SUGGESTIONS, pickSuggestions } from '@/lib/intent/suggestions';
import { creatorJoke, type CreatorSend } from '@/lib/intent/creatorJoke';
import { CreatorJoke, jokeOrigin, type ActiveJoke } from '@/components/workout/CreatorJoke';
import { playSfx } from '@/lib/audio/sfx';
import type {
  Exercise,
  MuscleId,
  RestClip,
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
    { label: 'Los que encajen', patch: { rounds: null } },
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

/** The sentence already fixes the routine's shape: "3 bloques", "4 series por bloque". */
function saysShape(prompt: string): boolean {
  return parseRounds(prompt) !== null || parseExercisesPerRound(prompt) !== null;
}

function questionsFor(prompt: string): Question[] {
  if (parseIntentKeywords(prompt).targetMinutes !== null) return [];
  return [
    Q_MINUTES,
    ...(saysShape(prompt) ? [] : [Q_ROUNDS]),
    ...(SAYS_INTENSITY.test(prompt) ? [] : [Q_INTENSITY]),
  ];
}
type Tray = 'minutes' | 'focus' | 'intensity' | null;
type Built = { queue: RoutineItem[]; meta: RoutineMeta };

/** A real build (not the fixed-seed preview): exercises from the last routines weigh less. */
function buildFor(list: Exercise[], intent: RoutineIntent, restClips: readonly RestClip[]): Built {
  return buildRoutine(list, intent, Math.random, { recentExerciseIds: recentExerciseIds(), restClips });
}

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
const DESKTOP = '(min-width: 64rem)';
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
// phone: what the empty bar says (the slogan above asks the question)
const PHONE_PLACEHOLDER = '¿Qué entrenamos hoy?';

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

/**
 * The minutes question's rocket: the more minutes, the more it burns and the harder it trembles,
 * from almost nothing at the least to a long flare at the most (live with the slider).
 */
function minutesEngine(minutes: number): { flame: number; shake: number } {
  return waitingEngine((minutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES));
}

// phone: this many suggestions in their list (it scrolls), at random once per page load
const SUGGESTION_COUNT = 9;
const SERVER_SUGGESTIONS: string[] = SUGGESTIONS.slice(0, SUGGESTION_COUNT);
let picked: string[] | null = null;
const browserSuggestions = () => (picked ??= pickSuggestions(SUGGESTION_COUNT));

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
  // the catalog's rest videos (the same download): each long rest gets one
  const restClipsRef = useRef<readonly RestClip[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const intentRef = useRef<Promise<RoutineIntent> | null>(null);

  // Phone: the creator's joke when the user asks for too little (lib/intent/creatorJoke.ts), at
  // most once per routine creation (reset when a routine is built).
  const pageRef = useRef<HTMLDivElement>(null);
  const jokeFired = useRef(false);
  const jokeCount = useRef(0);
  const [joke, setJoke] = useState<ActiveJoke | null>(null);
  /** True when this send is teased (or the joke is still up) instead of going through. */
  const tease = (send: CreatorSend, anchor: HTMLElement | null): boolean => {
    if (joke) return true;
    const kind = creatorJoke(send, { fired: jokeFired.current, phone: !window.matchMedia('(min-width: 64rem)').matches });
    if (!kind) return false;
    jokeFired.current = true;
    // (inside the tap: it may wake the sound up; a failed sound blocks nothing)
    playSfx('error', { gesture: true });
    const focused = document.activeElement;
    jokeCount.current += 1;
    setJoke({ id: jokeCount.current, kind, anchor, origin: jokeOrigin(anchor), focus: focused instanceof HTMLElement ? focused : null });
    return true;
  };

  // Phone: the rocket (CreatorRocket). The bar of the sentence is its body; at each question and
  // at "Empezar" it waits to be tapped. `hop`: how long the next one waits to come up (the last
  // one is still flying out).
  const barRef = useRef<HTMLDivElement>(null);
  const waitRef = useRef<HTMLElement | null>(null);
  const startRef = useRef<HTMLElement | null>(null);
  const [hop, setHop] = useState(0);
  const [barRises, setBarRises] = useState(false);
  const rocketWidth = useRocketWidth();
  // the bar bleeds 8 px into the side margins (its nozzle and antenna a little further): its width
  // is measured from the page itself (the window's width can grow with anything that overflows,
  // and the bar must never feed that back)
  const [barWidth, setBarWidth] = useState<number | null>(null);
  const barPx = barWidth ?? rocketWidth - 12;
  // it grows a line at a time as the sentence wraps (up to PAD_BAR.MAX_LINES; then it scrolls inside)
  const [lines, setLines] = useState(1);
  // suggestions at random, chosen in the browser (the server, and hydration, use the first ones)
  const suggestions = useSyncExternalStore(subscribeNoop, browserSuggestions, () => SERVER_SUGGESTIONS);

  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(getSpeechRecognition()),
    () => false,
  );
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => true);

  // Phone, first view: the bar is the new rocket (PadRocket), its field from right after the
  // checker strip to the microphone; the placeholder as big as fits there.
  const bar = useMemo(() => padBarLayout(barPx, lines, speechSupported), [barPx, lines, speechSupported]);
  const measureText = useTextMeasure(pageRef);
  const placeholderPx = useMemo(
    () => fitLabel(PHONE_PLACEHOLDER, bar.textWidth - 2, { max: PAD_BAR.TEXT_PX, min: PAD_BAR.PLACEHOLDER_MIN }, measureText).px,
    [bar.textWidth, measureText],
  );
  // ...the keyboard is up while the field has focus (the base hides; a short grace on blur, so a
  // tap on the microphone or "send" lands before anything moves)
  const [typing, setTyping] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);
  // ...the drum of suggestions: which one is centred (kept across "Cambiar"), and its stand-in clip
  const [drumCentre, setDrumCentre] = useState(0);
  const launching = useRef(false);
  const standIn = useMemo(() => standInExercise(suggestions[drumCentre] ?? '', library), [suggestions, drumCentre, library]);

  const loadExercises = useCallback(() => {
    if (!exercisesRef.current) {
      exercisesRef.current = Promise.all([fetchExercises(), fetchRests()]).then(([list, restClips]) => {
        exerciseListRef.current = list;
        restClipsRef.current = restClips;
        setLibrary(list);
        return list;
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
    // (only at computer width: on a phone-sized window the focused field hides the rocket base)
    if (window.matchMedia('(pointer: fine)').matches && window.matchMedia(DESKTOP).matches) document.getElementById('routine-prompt')?.focus();
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

  // Phone: how many lines the sentence takes in the bar (measured as it is typed, without the
  // field's own height).
  const measureLines = (field: HTMLTextAreaElement) => {
    if (window.matchMedia('(min-width: 64rem)').matches) return;
    const height = field.style.height;
    field.style.height = '0px';
    const next = barLines(field.scrollHeight);
    field.style.height = height;
    setLines(next);
  };
  // ...and once the sentence has been set from elsewhere (the voice, a suggestion, "Cambiar")
  const remeasure = () =>
    requestAnimationFrame(() => {
      const field = document.getElementById('routine-prompt');
      if (field instanceof HTMLTextAreaElement) measureLines(field);
    });

  // ...and each new line (or one less) lands with a "¡pam!": down at once, and a little shake.
  const shownLines = useRef(lines);
  useLayoutEffect(() => {
    const node = barRef.current;
    if (shownLines.current === lines) return;
    const more = lines > shownLines.current;
    shownLines.current = lines;
    if (!node || reducedMotion || window.matchMedia('(min-width: 64rem)').matches) return;
    const pam = node.animate(
      [
        { transform: `translateY(${more ? -7 : 4}px) scale(1, ${more ? 1.04 : 0.97})`, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
        { transform: 'translateY(3px) scale(1.01, 0.95)', offset: 0.3, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
        { transform: 'translate(-2px, 0px)', offset: 0.48 },
        { transform: 'translate(2px, 0px)', offset: 0.62 },
        { transform: 'translate(-1px, 0px)', offset: 0.78 },
        { transform: 'none' },
      ],
      { duration: 380 },
    );
    return () => pam.cancel();
  }, [lines, reducedMotion]);

  // Phone: the bar's own width, whenever the sentence view is up.
  useLayoutEffect(() => {
    const node = barRef.current;
    if (view !== 'ask' || !node) return;
    const read = () => {
      const w = node.clientWidth;
      if (w > 0) setBarWidth((old) => (old === w ? old : w));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);

  // Back to the sentence ("Cambiar"): the bar comes back up from below.
  useLayoutEffect(() => {
    const node = barRef.current;
    if (view !== 'ask' || !barRises || !node || window.matchMedia('(min-width: 64rem)').matches) return;
    const rise = reducedMotion
      ? node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 })
      : node.animate(riseKeyframes(0), { duration: HOP.riseMs });
    return () => rise.cancel();
  }, [view, barRises, reducedMotion]);

  /**
   * `launched`: a suggestion of the rocket base (phone) whose own launch has already played; it
   * goes on exactly as a picked suggestion, with nothing more to fly.
   */
  const submit = (raw: string, picked?: HTMLElement | null, launched = false) => {
    const prompt = raw.trim();
    if (!prompt) return;
    if (launching.current && !launched) return; // a rocket of the base is taking off
    launching.current = false;
    // a sentence the user wrote (not a suggestion) that asks for too little: teased, nothing flies
    if (!picked && !launched && tease({ kind: 'sentence', prompt }, barRef.current)) return;
    // what takes off (phone): the suggestion picked, or else the bar with the sentence; the next
    // step is already here
    setHop(
      launched
        ? 0
        : picked
          ? launchRocket(picked, { ms: HOP.launchMs, tilt: picked.dataset.upright ? -90 : 0 })
          : launchRocket(barRef.current, { ms: HOP.launchMs, text: prompt }),
    );
    recognitionRef.current?.stop();
    setError('');
    setText(prompt);
    // Gemini reads the sentence while the user answers, so nobody waits for it.
    intentRef.current = resolveIntent(prompt).then((parsed) => ({
      ...parsed,
      rounds: parseRounds(prompt) ?? parsed.rounds ?? null,
      exercisesPerRound: parseExercisesPerRound(prompt) ?? parsed.exercisesPerRound ?? null,
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

  /** The waiting rocket of a question flies off: a short hop to the next one, the full climb at the last. */
  const launchQuestion = (last: boolean) =>
    setHop(launchRocket(waitRef.current, { ms: last ? HOP.launchMs : HOP.hopMs, tilt: CREATOR.tilt }));

  const answer = (patch: Partial<RoutineIntent>, picked?: HTMLElement | null) => {
    // the option tapped takes off (its own rocket), or the waiting one ("Seguir")
    if (picked) setHop(launchRocket(picked, { ms: asked + 1 >= questions.length ? HOP.launchMs : HOP.hopMs }));
    else launchQuestion(asked + 1 >= questions.length);
    const next = { ...answers, ...patch };
    setAnswers(next);
    setAsked(asked + 1);
    if (asked + 1 >= questions.length) void build(next);
  };

  const build = async (extra: Partial<RoutineIntent>) => {
    jokeFired.current = false; // the next routine created may be teased again
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

    let list: Exercise[];
    try {
      list = await loadExercises();
    } catch {
      setError('No he podido cargar los ejercicios. Revisa la conexión e inténtalo otra vez.');
      backToAsk();
      return;
    }

    try {
      const parsed = await (intentRef.current ?? resolveIntent(text));
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
      setBuilt(buildFor(list, next, restClipsRef.current));
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
    setBarRises(true);
    remeasure();
    setView('ask');
  };

  // "Empezar": the rocket takes off, and the player's rocket arrives for the warm-up once it has gone.
  const start = () => {
    if (!built || !intent) return;
    const gone = launchRocket(startRef.current, { ms: HOP.launchMs, tilt: CREATOR.tilt });
    if (gone > 0) launchedUntil(performance.now() + gone);
    onStart(built.queue, built.meta, intent, text);
  };

  /** The routine these minutes would give, as "3 bloques de 5 series" (fixed seed: no reshuffle while dragging). */
  const shapeFor = (minutes: number, base?: RoutineIntent | null) => {
    const list = library;
    if (list.length === 0) return undefined;
    const intent = base ?? { ...parseIntentKeywords(text), rounds: parseRounds(text) };
    const { meta } = buildRoutine(list, { ...intent, targetMinutes: minutes }, () => 0.42);
    // Before the blocks are chosen only the total is certain.
    return base?.rounds || base?.exercisesPerRound || saysShape(text)
      ? blocksAndSeries(meta.rounds, meta.exercisesPerRound)
      : `≈ ${meta.rounds * meta.exercisesPerRound} series en total`;
  };

  const retouch = (next: RoutineIntent) => {
    setIntent(next);
    setBuilt(buildFor(exerciseListRef.current, next, restClipsRef.current));
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
      remeasure();
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

  // Phone: where the field, the microphone and "send" sit in the rocket's hull, as CSS variables the bar's `max-lg:` classes read.
  const barVars = {
    '--bar-h': `${bar.height}px`,
    '--fig-l': `${-bar.hangLeft}px`,
    '--txt-l': `${bar.textLeft}px`,
    '--txt-w': `${bar.textWidth}px`,
    '--mic-l': `${bar.micLeft ?? bar.sendLeft}px`,
    '--send-l': `${bar.sendLeft}px`,
    '--ctl-t': `${bar.ctlTop}px`,
    '--disc': `${2 * bar.discR}px`,
    '--ph-px': `${placeholderPx}px`,
    // the field: as many lines as the bar holds, centred in its hull
    '--txt-h': `${bar.fieldHeight}px`,
    '--txt-t': `${bar.fieldTop}px`,
  } as CSSProperties;
  // Phone, first view: the dark page with the porthole and the rocket base (computer: as before)
  const phoneAsk = view === 'ask';

  return (
    <div
      ref={pageRef}
      className={`relative isolate flex min-h-dvh w-full flex-col bg-paper font-[family-name:var(--font-display)] text-ink selection:bg-ink selection:text-white lg:flex-row ${phoneAsk ? 'max-lg:bg-[#2b2a28]' : ''}`}
    >
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
          <span className="text-lg font-bold tracking-tight max-lg:text-white">Everyday M</span>
        )}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            aria-label="Estudio y modo avanzado"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-ink/65 hover:bg-ink/10 hover:text-ink ${focusRing} ${
              phoneAsk ? 'max-lg:text-white/75 max-lg:hover:bg-white/10 max-lg:hover:text-white max-lg:focus-visible:outline-white' : ''
            }`}
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
        className={`media-feather relative mx-auto aspect-[9/16] shrink-0 overflow-hidden transition-[height,opacity] duration-500 lg:mx-0 lg:h-dvh ${view === 'questions' ? 'h-[30dvh]' : view === 'result' && ready ? 'h-[36dvh]' : 'h-[52dvh]'} ${
          // phone, first view: out of the way (the porthole shows Marcel); it stays loaded for the build
          phoneAsk ? 'max-lg:pointer-events-none max-lg:absolute max-lg:inset-x-0 max-lg:top-0 max-lg:opacity-0' : ''
        }`}
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
          className={`mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 pb-8 sm:px-8 lg:px-16 max-lg:h-dvh max-lg:justify-start max-lg:gap-0 max-lg:pt-[calc(4rem+env(safe-area-inset-top))] ${
            typing ? 'max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'max-lg:pb-0'
          }`}
        >
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-balance text-[clamp(2.5rem,10vw,5rem)] font-semibold leading-[0.98] tracking-[-0.035em] max-lg:hidden"
          >
            ¿Qué entrenamos hoy?
          </motion.h1>

          {/* phone: the slogan over the dark page, and Marcel in the porthole behind it */}
          <h1 className="relative z-10 mt-1 text-[clamp(1.9rem,9.6vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-white lg:hidden">
            ¿Te quieres
            <br />
            poner como
            <br />
            <span className="text-heat">un cohete?</span>
          </h1>
          <div className="relative min-h-0 flex-1 lg:hidden">
            <Porthole
              clip={standIn}
              neutral={typing || text.trim() !== ''}
              className="absolute left-1/2 top-1/2 aspect-square h-[min(calc(100%+7rem),88vw)] -translate-x-1/2 -translate-y-1/2"
            />
          </div>

          {/* on a phone the bar is the rocket: the field is its hull, "send" sits at the front */}
          <div
            ref={barRef}
            style={barVars}
            className="flex items-end gap-2 rounded-[28px] bg-white p-2 pl-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] max-lg:relative max-lg:-mx-2 max-lg:mb-3 max-lg:block max-lg:h-[var(--bar-h)] max-lg:shrink-0 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none"
          >
            <PadRocket
              g={bar.g}
              flame={text.trim() ? 0.3 : 0}
              parts={{ hatch: false }}
              className="pointer-events-none absolute left-[var(--fig-l)] top-0 lg:hidden"
            />
            <label htmlFor="routine-prompt" className="sr-only">
              Describe tu rutina
            </label>
            <textarea
              id="routine-prompt"
              rows={1}
              maxLength={500}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                measureLines(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              onFocus={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                setTyping(true);
              }}
              onBlur={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                blurTimer.current = setTimeout(() => setTyping(false), 250);
              }}
              placeholder={desktop ? 'Hombros, 20 minutos' : PHONE_PLACEHOLDER}
              className="field-sizing-content max-h-40 min-h-12 flex-1 resize-none bg-transparent py-3 text-lg font-medium text-ink caret-ink placeholder:text-ink/50 focus:outline-none max-lg:absolute max-lg:left-[var(--txt-l)] max-lg:top-[var(--txt-t)] max-lg:h-[var(--txt-h)] max-lg:max-h-none max-lg:min-h-0 max-lg:w-[var(--txt-w)] max-lg:flex-none max-lg:overflow-x-hidden max-lg:overflow-y-auto max-lg:rounded-lg max-lg:py-[10px] max-lg:leading-6 max-lg:caret-heat max-lg:[field-sizing:fixed] max-lg:[clip-path:inset(8px_0)] max-lg:[scrollbar-width:none] max-lg:placeholder:text-[length:var(--ph-px)] max-lg:placeholder:text-[#888780] max-lg:focus-visible:bg-ink/[0.04]"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={listening}
                aria-label={listening ? 'Parar de escuchar' : 'Dictar por voz'}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${focusRing} max-lg:absolute max-lg:left-[var(--mic-l)] max-lg:top-[var(--ctl-t)] max-lg:h-11 max-lg:w-[38px] ${
                  listening
                    ? 'animate-pulse bg-heat text-white max-lg:bg-transparent max-lg:text-heat'
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
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-[transform,opacity] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 ${focusRing} max-lg:absolute max-lg:left-[var(--send-l)] max-lg:top-[var(--ctl-t)] max-lg:h-11 max-lg:w-11 max-lg:bg-transparent`}
            >
              {/* (on a phone, an ink disc at the front of the hull; on a computer the button itself is the disc) */}
              <span className="contents max-lg:flex max-lg:h-[var(--disc)] max-lg:w-[var(--disc)] max-lg:items-center max-lg:justify-center max-lg:rounded-full max-lg:bg-ink">
                <ArrowUp className="h-5 w-5 max-lg:h-4 max-lg:w-4" strokeWidth={2.6} aria-hidden="true" />
              </span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 max-lg:hidden">
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
            <p role="alert" className="text-[15px] font-medium text-[#c41f14] max-lg:mb-2 max-lg:text-[#ff8a80]">
              {error}
            </p>
          )}

          {/* phone: the rocket base, the suggestions on its drum and the red "Random" button; hidden
              while the keyboard is up */}
          <div className={`-mx-5 shrink-0 sm:-mx-8 lg:hidden ${typing ? 'hidden' : ''}`}>
            <LaunchBase
              suggestions={suggestions}
              initialIndex={drumCentre}
              onCentre={setDrumCentre}
              onLaunchStart={() => {
                launching.current = true;
              }}
              onLaunch={(suggestion) => submit(suggestion, null, true)}
            />
          </div>
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
                        className={`flex h-16 items-center justify-center rounded-full bg-ink text-xl font-semibold text-white ${focusRing} max-lg:hidden`}
                      >
                        Seguir
                      </motion.button>
                    </div>
                  ) : (
                  <>
                  {/* phone: each option is a rocket, one above the other; the one tapped takes off */}
                  <RiseIn delay={Math.min(hop, 300)} className="flex flex-col items-start gap-3 lg:hidden">
                    {q.options.map((option) => (
                      <ChoiceRocket
                        key={option.label}
                        text={option.label}
                        minChars={Math.max(...q.options.map((o) => o.label.length))}
                        onClick={(e) => {
                          const difficulty = q.id === 'intensity' ? option.patch.difficulty : undefined;
                          if (difficulty !== undefined && tease({ kind: 'intensity', difficulty }, e.currentTarget)) return;
                          answer(option.patch, e.currentTarget);
                        }}
                      />
                    ))}
                  </RiseIn>
                  <div className={`grid gap-2.5 max-lg:hidden sm:flex sm:flex-wrap ${q.options.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                  </>
                  )}
                </motion.div>
              ))}
          </AnimatePresence>
          {/* phone: on the minutes the rocket waits for the tap: it is the "Seguir" button (on the
              other questions the options are the rockets) */}
          {questions[asked]?.id === 'minutes' && (
            <WaitingRocket
              key={asked}
              ref={waitRef}
              riseDelay={hop}
              label="Seguir"
              onClick={() => {
                if (tease({ kind: 'minutes', minutes: draftMinutes }, waitRef.current)) return;
                answer({ targetMinutes: draftMinutes });
              }}
              // the more minutes, the longer its flame and the harder it trembles
              flame={minutesEngine(draftMinutes).flame}
              shake={minutesEngine(draftMinutes).shake}
              // (close under the slider: it is that step's button)
              pullUp={40}
            />
          )}
          <button
            type="button"
            onClick={() => {
              launchQuestion(true);
              void build(answers);
            }}
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
          className={`mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-5 pb-8 sm:px-8 lg:px-16 ${ready ? 'max-lg:justify-start max-lg:pb-48 max-lg:pt-4' : ''}`}
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
                {/* (on a phone the routine's rocket below carries these lines, a segment per block) */}
                <Hilo surface="light" className="max-lg:hidden" blocks={built.meta.blocks.map((block) => block.map(() => 'todo' as const))} />
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
                  onClick={start}
                  className={`flex h-16 items-center justify-center gap-3 rounded-full bg-ink text-xl font-semibold text-white shadow-[0_22px_40px_-22px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${focusRing} max-lg:hidden`}
                >
                  <Play className="h-5 w-5 fill-current" aria-hidden="true" />
                  Empezar
                </button>
                {/* phone: "Empezar" is the rocket, back from its last flight */}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* phone: "Empezar" is the routine's own rocket, put together piece by piece (a segment per
          block with its series, the nose, the boosters of the warm-up), held at the bottom of the
          screen so it is always whole (the content scrolls under it). Outside the steps' moving
          layers: a transformed parent would hold a fixed element in place of the screen. */}
      {view === 'result' && ready && built && intent && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center lg:hidden [&>*]:pointer-events-auto">
          <LaunchRocket
            ref={startRef}
            blocks={built.meta.blocks.map((block) => block.map(() => 'todo' as const))}
            boosters={built.queue.some((item) => item.kind === 'warmup')}
            onClick={start}
          />
        </div>
      )}

      <CreatorJoke joke={joke} shakeTarget={pageRef} onDone={() => setJoke(null)} />
    </div>
  );
}

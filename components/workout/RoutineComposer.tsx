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
import { PadRocket } from '@/components/workout/PadRocket';
import { NoseCarry, NoseCrane, noseCraneReach, type NoseSpot } from '@/components/workout/NoseCarry';
import { NOSE_DOCK, noseDock, type NoseDock } from '@/components/workout/noseDock';
import { PAD_BAR, fitLabel, padBarLayout } from '@/components/workout/padRocketShape';
import { LaunchBase, useTextMeasure, type LaunchHold } from '@/components/workout/LaunchBase';
import { fitDrumLabel } from '@/components/workout/drumLabel';
import { Porthole } from '@/components/workout/Porthole';
import { standInExercise } from '@/lib/intent/standIn';
import { randomLanding } from '@/components/workout/drumRandom';
import { SUGGESTIONS, pickSuggestions } from '@/lib/intent/suggestions';
import { creatorJoke, type CreatorSend } from '@/lib/intent/creatorJoke';
import { CreatorJoke, jokeOrigin, type ActiveJoke } from '@/components/workout/CreatorJoke';
import { playSfx } from '@/lib/audio/sfx';
import { creatorSfx } from '@/lib/audio/creatorSfx';
import { unlockPlayerAudio } from '@/lib/audio/unlock';
import { AssemblyScene, type Take } from '@/components/workout/AssemblyScene';
import { LoosePiece } from '@/components/workout/AssemblyRocket';
import { FINALE_SENTENCE, LaunchFinale, type FinaleDress, type FinalePhase } from '@/components/workout/LaunchFinale';
import { openVeil, type Veil } from '@/components/workout/whiteVeil';
import { veilHandOffMs } from '@/components/workout/veilTrail';
import { LAUNCH } from '@/components/workout/launchDrum';
import type { Outfit } from '@/components/workout/PortholePerson';
import {
  FINALE,
  OPEN_QUESTIONS_MS,
  PAGE_DAY,
  GRAB,
  finaleSentence,
  shownMinutes,
  fittedTarget,
  igniteAt,
  joinNames,
  pieceModes,
  portholeTimeline,
  skyInk,
  skyStep,
  titleSize,
  TITLE_PX,
  type PieceId,
} from '@/components/workout/assembly';
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
/** The sentence in the nose never goes below this size, px (then it is cut with «…»). */
const NOSE_TEXT_MIN = 13;

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

/** The routine's focus in words: "pierna y glúteo", "full body", "full body con foco en hombros". */
function focusText(intent: RoutineIntent): string {
  const { fullBody, names } = focusParts(intent);
  if (fullBody) return names.length > 0 ? `full body con foco en ${joinNames(names)}` : 'full body';
  return joinNames(names);
}

/**
 * Phone: the automatic finale after the routine is built (the questions' assembly, path B, or the
 * start screen's own launch, path C): its phase, when the sentence went up, where the smoke starts,
 * and whether the start screen's base is flying the rocket (it then holds on the pad: liftGate).
 */
type Finale = {
  path: 'B' | 'C';
  phase: FinalePhase;
  startedAt: number;
  shownAt: number | null;
  smokeFrom: { x: number; y: number } | null;
  viaBase: boolean;
  /** C, held on the base's pad: the big porthole between the sentence and the rocket (LaunchFinale) */
  dress?: FinaleDress | null;
};

const isPhone = () => typeof window !== 'undefined' && !window.matchMedia(DESKTOP).matches;
const clockNow = () => performance.now();

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
  // Phone: the questions build the routine's rocket (AssemblyScene) and it then takes off by itself
  const [assembled, setAssembled] = useState(false);
  // phone: the answer's piece on its way to the rocket (the next question waits until it is bolted)
  const [pending, setPending] = useState<(Take & { taken: boolean }) | null>(null);
  // what the sentence was understood as (Gemini, or the local parser), for the pieces' labels
  const [heard, setHeard] = useState<RoutineIntent | null>(null);
  const [finale, setFinale] = useState<Finale | null>(null);
  const finaleRef = useRef<Finale | null>(null);
  // the start screen's base holding its rocket on the pad until the sentence has been read (and
  // the porthole's change of clothes has played): its go, and where its rocket will stand
  const gateRef = useRef<(() => void) | null>(null);
  const holdRef = useRef<(LaunchHold & { uprightAt: number }) | null>(null);
  const veilRef = useRef<Veil | null>(null);
  // a fresh base after going back (a launch held on its pad is dropped with it)
  const [baseKey, setBaseKey] = useState(0);
  // phone: the start screen fading away over the questions as they open (the same dawn under both)
  const [askLeaving, setAskLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);
  const updateFinale = useCallback((next: Partial<Finale> | Finale | null) => {
    const value = next === null ? null : ({ ...(finaleRef.current ?? {}), ...next } as Finale);
    finaleRef.current = value;
    setFinale(value);
  }, []);
  useEffect(
    () => () => {
      // (left in the middle of the white: never leave it over the page)
      veilRef.current?.release();
    },
    [],
  );

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
  // (phone: the sentence in the nose always stays on one line: smaller, then cut with «…»)
  const lines = 1;
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
  // (phone: the bar is a rocket's nose piece, hanging from the crane)
  const bar = useMemo(() => padBarLayout(barPx, lines, speechSupported, { nose: true }), [barPx, lines, speechSupported]);
  // ...and once sent, that nose is carried by the crane to the questions' rocket (NoseCarry): from
  // where it was, to where the scene's nose hangs (the scene tells: noseSpot)
  const [carry, setCarry] = useState<{ from: { left: number; top: number }; text: string } | null>(null);
  const [noseSpot, setNoseSpot] = useState<NoseSpot | null>(null);
  const measureText = useTextMeasure(pageRef);
  // the sentence in the nose: as big as fits on its one line (down to NOSE_TEXT_MIN), then cut with
  // «…» (keeping its minutes, as on the wheel) while it is not being typed in (while typing, the
  // field scrolls to the caret)
  const noseText = useMemo(
    () => (text.trim() ? fitDrumLabel(text, bar.textWidth - 2, { max: PAD_BAR.TEXT_PX, min: NOSE_TEXT_MIN }, measureText) : null),
    [text, bar.textWidth, measureText],
  );
  const placeholderPx = useMemo(
    () => fitLabel(PHONE_PLACEHOLDER, bar.textWidth - 2, { max: PAD_BAR.TEXT_PX, min: PAD_BAR.PLACEHOLDER_MIN }, measureText).px,
    [bar.textWidth, measureText],
  );
  // ...the keyboard is up while the field has focus: the base stays where it is and the crew climb
  // onto the bar's top to wait (a short grace on blur, so a tap on the microphone or "send" lands
  // before anything moves)
  const [typing, setTyping] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);
  // ...and the page keeps its height meanwhile. Some Android browsers shrink the layout viewport
  // (and so `dvh`) under the keyboard, which would squeeze the porthole, lift the base and drop the
  // bar; so on focus the form's height is held in px, and the base reads its 40dvh from that
  // (--pad-dvh) until the field is left. (Not testable without a real phone keyboard.)
  const formRef = useRef<HTMLFormElement>(null);
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  // ...and, like a chat, the nose rests just above the keyboard (the crane lowers it, or lifts it
  // if the keyboard leaves too little room) and the keyboard covers the rocket base, which fades
  // out. Where the keyboard's top is: the visual viewport (noseDock). The browser's own scroll to
  // the field is undone: the slogan and the porthole stay where they are.
  // (shown instead of the field's own text while not typed in, when it is smaller than 16 px or cut)
  const noseCopy = !desktop && !typing && noseText !== null && (noseText.cut || noseText.px < 16) ? noseText : null;
  const [dock, setDock] = useState<NoseDock | null>(null);
  const docked = typing && !desktop && dock?.open ? dock : null;
  const portholeBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const form = formRef.current;
    const bar = barRef.current;
    if (!typing || desktop || !vv || !form || !bar) return;
    const read = () => {
      // (no page scroll: the browser's own move to the field is undone)
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const top = window.scrollY;
      // where the nose hangs when nothing is open: from the layout, whatever it is moved by now
      let noseBottom = bar.offsetHeight;
      for (let n: HTMLElement | null = bar; n; n = n.offsetParent instanceof HTMLElement ? n.offsetParent : null) noseBottom += n.offsetTop;
      const ph = portholeBoxRef.current?.firstElementChild;
      setDock(
        noseDock({
          pageH: form.getBoundingClientRect().bottom + top,
          vvHeight: vv.height,
          vvPageTop: top + vv.offsetTop,
          noseBottom,
          portholeH: ph instanceof HTMLElement ? ph.offsetHeight : 0,
        }),
      );
    };
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    window.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
      window.removeEventListener('scroll', read);
    };
  }, [typing, desktop]);
  // ...the drum of suggestions: which one is centred (kept across "Cambiar"), and its stand-in clip
  const [drumCentre, setDrumCentre] = useState(0);
  const launching = useRef(false);
  // ...the sentences on the drum: today's suggestions, with the ones "Random" brought from the
  // whole bank put in their slots (kept across "Cambiar")
  const [drumSwaps, setDrumSwaps] = useState<Record<number, string>>({});
  const drum = useMemo(() => suggestions.map((s, i) => drumSwaps[i] ?? s), [suggestions, drumSwaps]);
  const randomRecent = useRef<string[]>([]);
  const standIn = useMemo(() => standInExercise(drum[drumCentre] ?? '', library), [drum, drumCentre, library]);

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
    // (phone: a launch of the base that goes straight on into the finale has nothing more to do here)
    if (launched && finaleRef.current) return;
    if (launching.current && !launched) return; // a rocket of the base is taking off
    launching.current = false;
    // a sentence the user wrote (not a suggestion) that asks for too little: teased, nothing flies
    if (!picked && !launched && tease({ kind: 'sentence', prompt }, barRef.current)) return;
    // phone: the typed sentence is the nose itself: the crane carries it to the questions' rocket
    // (whatever it says: what it already says goes on by itself there), the keyboard closes
    if (!picked && !launched && isPhone()) {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      const field = document.getElementById('routine-prompt');
      if (field instanceof HTMLElement) field.blur();
      setTyping(false);
      setHeldHeight(null);
      const nose = barRef.current?.querySelector<SVGSVGElement>('svg.nose-bar');
      if (nose && !reducedMotion) {
        const r = nose.getBoundingClientRect();
        setCarry({ from: { left: r.left, top: r.top }, text: prompt });
        // (the bar itself goes: the carried copy is the nose now)
        if (barRef.current) barRef.current.style.visibility = 'hidden';
      }
      understand(prompt);
      goOn(prompt, true);
      return;
    }
    // what takes off (phone): the suggestion picked, or else the bar with the sentence; the next
    // step is already here
    setHop(
      launched
        ? 0
        : picked
          ? launchRocket(picked, { ms: HOP.launchMs, tilt: picked.dataset.upright ? -90 : 0 })
          : launchRocket(barRef.current, { ms: HOP.launchMs, text: prompt }),
    );
    understand(prompt);
    goOn(prompt, false);
  };

  /** The sentence is read: Gemini starts at the tap (while the rocket flies and the user answers), so nobody waits for it. */
  const understand = (prompt: string) => {
    recognitionRef.current?.stop();
    setError('');
    setText(prompt);
    const understood = resolveIntent(prompt).then((parsed) => ({
      ...parsed,
      rounds: parseRounds(prompt) ?? parsed.rounds ?? null,
      exercisesPerRound: parseExercisesPerRound(prompt) ?? parsed.exercisesPerRound ?? null,
    }));
    intentRef.current = understood;
    setHeard(null);
    understood
      .then((parsed) => {
        if (intentRef.current === understood) setHeard(parsed);
      })
      .catch(() => {});
  };

  /**
   * Phone, a sentence with nothing to ask (path C): the start screen's own launch carries it, the
   * sky turns to day, and the finale follows. Inside the tap: the player's sound is unlocked now
   * (no "Empezar" tap will come), the music only starts with the workout.
   */
  const beginAuto = (prompt: string, viaBase: boolean) => {
    unlockPlayerAudio({ startMusic: false });
    understand(prompt);
    gateRef.current = null;
    holdRef.current = null;
    updateFinale({ path: 'C', phase: 'wait', startedAt: clockNow(), shownAt: null, smokeFrom: null, viaBase });
    void build({}, false);
  };

  /**
   * On to the questions, or straight to the build. `typed` (phone): a typed sentence always goes on
   * to the questions' scene, even with nothing to ask (its pieces then go on by themselves).
   */
  const goOn = (prompt: string, typed = false) => {
    // (phone, path C: the finale is already under way)
    if (finaleRef.current) return;
    const pending = questionsFor(prompt);
    if (pending.length > 0 || (typed && isPhone())) {
      // (nothing to ask: this tap was the creator's last; the routine is built behind the assembly)
      if (pending.length === 0) {
        lastTap();
        void build({}, false);
      }
      setQuestions(pending);
      setAnswers({});
      setAsked(0);
      setAssembled(false);
      if (isPhone() && !reducedMotion) {
        setAskLeaving(true);
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => setAskLeaving(false), OPEN_QUESTIONS_MS);
      }
      setView('questions');
      return;
    }
    // (phone: never the ready view; whatever got here without its finale goes into one now)
    if (isPhone()) {
      updateFinale({ path: 'C', phase: 'wait', startedAt: clockNow(), shownAt: null, smokeFrom: null, viaBase: false });
      void build({}, false);
      return;
    }
    void build({});
  };

  /** Phone: the last real tap of the creator (the routine starts by itself after it): sound unlocked now, music with the workout. */
  const lastTap = () => {
    if (isPhone()) unlockPlayerAudio({ startMusic: false });
  };

  /** The waiting rocket of a question flies off: a short hop to the next one, the full climb at the last. */
  const launchQuestion = (last: boolean) =>
    setHop(launchRocket(waitRef.current, { ms: last ? HOP.launchMs : HOP.hopMs, tilt: CREATOR.tilt }));

  const answer = (patch: Partial<RoutineIntent>, picked?: HTMLElement | null) => {
    const last = asked + 1 >= questions.length;
    if (last) lastTap();
    // the option tapped takes off (its own rocket), or the waiting one ("Seguir")
    if (picked) setHop(launchRocket(picked, { ms: last ? HOP.launchMs : HOP.hopMs }));
    else launchQuestion(last);
    const next = { ...answers, ...patch };
    setAnswers(next);
    setAsked(asked + 1);
    // (phone: the routine is built behind the assembly; the finale starts it)
    if (last) void build(next, !isPhone());
  };

  /**
   * Phone: an answer tapped as its piece (`el`, the loose piece's button). That very piece goes to
   * the rocket (AssemblyScene takes it from its place); the next question comes once it is bolted
   * (pieceFitted). With reduced motion it simply appears in place and the next question follows.
   */
  const answerWith = (patch: Partial<RoutineIntent>, piece: PieceId, el: HTMLElement, label: string, tank = false) => {
    if (pending) return;
    const last = asked + 1 >= questions.length;
    if (last) lastTap();
    const next = { ...answers, ...patch };
    setAnswers(next);
    if (reducedMotion) setAsked(asked + 1);
    else {
      const box = (el.querySelector('svg[data-piece]') ?? el).getBoundingClientRect();
      // (the minutes' tank: the crane takes the whole tank, which becomes the piece on its way)
      setPending({ piece, rect: { left: box.left, top: box.top }, label, taken: false, ...(tank ? { tank: { w: box.width, h: box.height, minutes: patch.targetMinutes ?? draftMinutes } } : {}) });
    }
    if (last) void build(next, false);
  };
  const pieceTaken = useCallback((piece: PieceId) => {
    setPending((p) => (p && p.piece === piece && !p.taken ? { ...p, taken: true } : p));
  }, []);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (nextTimer.current) clearTimeout(nextTimer.current);
  }, []);
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const pieceFitted = useCallback((piece: PieceId) => {
    if (pendingRef.current?.piece !== piece) return;
    // a beat with the piece on, then the next question
    if (nextTimer.current) clearTimeout(nextTimer.current);
    nextTimer.current = setTimeout(() => {
      setAsked((a) => a + 1);
      setPending(null);
    }, GRAB.beatMs);
  }, []);

  /** `show`: the build-up of the ready view (the computer, "Cambiar"); without it (phone), it is built out of sight. */
  const build = async (extra: Partial<RoutineIntent>, show = true) => {
    jokeFired.current = false; // the next routine created may be teased again
    setBuilt(null);
    setTray(null);
    if (show) {
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
    // (phone: whatever was being built or taking off is dropped, the base starts afresh)
    if (finaleRef.current) setBaseKey((k) => k + 1);
    gateRef.current = null;
    holdRef.current = null;
    updateFinale(null);
    launching.current = false;
    setAssembled(false);
    setPending(null);
    if (nextTimer.current) clearTimeout(nextTimer.current);
    setView('ask');
  };

  /** Phone, the finale's end: the workout starts (with the warm-up), under the white that then dissolves. */
  const latest = useRef({ built, intent, text, onStart });
  useLayoutEffect(() => {
    latest.current = { built, intent, text, onStart };
  });
  const handOff = useCallback(() => {
    const { built: b, intent: i, text: t, onStart: start } = latest.current;
    if (!b || !i) return;
    // (the player's rocket arrives once the white has gone)
    launchedUntil(performance.now() + FINALE.veilFadeMs);
    start(b.queue, b.meta, i, t);
    veilRef.current?.release();
    veilRef.current = null;
  }, []);

  // B: the whole rocket is on and the routine is built: the sentence and «Cambiar» go up
  useEffect(() => {
    if (desktop || view !== 'questions' || !assembled || !built || finaleRef.current) return;
    const t = setTimeout(() => updateFinale({ path: 'B', phase: 'read', startedAt: performance.now(), shownAt: performance.now(), smokeFrom: null, viaBase: false }), 0);
    return () => clearTimeout(t);
  }, [desktop, view, assembled, built, updateFinale]);

  // the finale, a phase at a time
  useEffect(() => {
    if (!finale) return;
    const now = performance.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)));
    if (finale.phase === 'wait' && built) {
      // C: the sentence goes up once the routine is built, and not before the drum has cleared away
      at(finale.startedAt + FINALE.cSentenceMs - now, () => updateFinale({ phase: 'read', shownAt: performance.now() }));
    } else if (finale.phase === 'read' && finale.shownAt !== null) {
      const ignite = () => {
        const go = gateRef.current;
        gateRef.current = null;
        if (go) {
          updateFinale({ phase: 'launch' });
          go();
        } else updateFinale({ phase: 'smoke', smokeFrom: null });
      };
      const hold = holdRef.current;
      if (finale.path === 'C' && finale.viaBase && !reducedMotion && hold) {
        // the base's rocket, held on its pad: once it stands there (and the sentence is up) the big
        // porthole plays the change of clothes and shrinks into its window; it lifts off as it arrives
        if (!finale.dress) {
          const startAt = Math.max(finale.shownAt, hold.uprightAt);
          at(0, () => updateFinale({ dress: { window: hold.window, top: hold.top, startAt } }));
        } else at(finale.dress.startAt + portholeTimeline(LAUNCH.igniteMs).igniteAt - now, ignite);
      } else if (finale.path === 'C' && finale.viaBase && !reducedMotion) {
        // (no word of where it stands: lift off once the sentence has been read)
        at(igniteAt(finale.shownAt, LAUNCH.igniteMs) - now, ignite);
      } else if (finale.path === 'B' && !reducedMotion) {
        // (B: the assembly scene plays its own ending and lifts off: onLiftOff)
      } else {
        at(finale.shownAt + FINALE.readMs - now, () =>
          updateFinale(reducedMotion ? { phase: 'white' } : { phase: 'smoke', smokeFrom: null }),
        );
      }
    } else if (finale.phase === 'smoke') {
      at(FINALE.smokeMs, () => updateFinale({ phase: 'white' }));
    } else if (finale.phase === 'white') {
      if (!veilRef.current) creatorSfx('veil');
      const warmup = Boolean(built?.queue.some((item) => item.kind === 'warmup'));
      veilRef.current ??= openVeil({ warmup, reduced: Boolean(reducedMotion) });
      // (the words held 2 s once they are all in)
      at(veilHandOffMs(warmup ? 2 : 1, Boolean(reducedMotion)), handOff);
    }
    return () => timers.forEach(clearTimeout);
  }, [finale, built, reducedMotion, updateFinale, handOff]);

  /** The rocket lifts off (the assembly's, or the base's held one): the smoke from its pad. */
  const liftOff = useCallback(
    (pad: { x: number; y: number }) => {
      if (finaleRef.current) updateFinale({ phase: 'smoke', smokeFrom: pad });
    },
    [updateFinale],
  );
  const onAssembled = useCallback(() => setAssembled(true), []);

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
    // (phone, typing: docked over the keyboard; the crane's arm stays, its cable longer by --nose-lower)
    transform: docked ? `translateY(${docked.lower - docked.rise}px)` : undefined,
    transition: reducedMotion ? undefined : `transform ${NOSE_DOCK.moveMs}ms cubic-bezier(0.2, 0.8, 0.3, 1)`,
    '--nose-lower': docked ? docked.lower : 0,
    '--bar-h': `${bar.height}px`,
    '--fig-l': `${-bar.hangLeft}px`,
    '--txt-l': `${bar.textLeft}px`,
    '--txt-w': `${bar.textWidth}px`,
    '--mic-l': `${bar.micLeft ?? bar.sendLeft}px`,
    '--send-l': `${bar.sendLeft}px`,
    '--ctl-t': `${bar.ctlTop}px`,
    '--disc': `${2 * bar.discR}px`,
    '--ph-px': `${placeholderPx}px`,
    '--txt-px': `${noseText?.px ?? PAD_BAR.TEXT_PX}px`,
    // the field: as many lines as the bar holds, centred in its hull
    '--txt-h': `${bar.fieldHeight}px`,
    '--txt-t': `${bar.fieldTop}px`,
  } as CSSProperties;
  // Phone, first view: the dark page with the porthole and the rocket base (computer: as before)
  const phoneAsk = view === 'ask';
  // Phone: the questions build the rocket in the dawn (AssemblyScene); the sky's step follows the pieces
  const phoneQuestions = view === 'questions' && !desktop;
  const questionIds = questions.map((q) => q.id);
  // (an answer whose piece is on its way counts: the pieces known after it come once it is on)
  const answeredCount = asked + (pending ? 1 : 0);
  const fitted = fittedTarget(questionIds, answeredCount);
  const sky = skyStep(fitted);
  // the sky is still dark at the top (light text) on the phone's first view and the first steps
  const darkTop = (phoneAsk && finale?.path !== 'C') || (phoneQuestions && !skyInk(sky));
  // C: the start screen turns to day while its rocket takes off
  const dayC = phoneAsk && finale?.path === 'C';
  // what is written on the pieces: the sentence as understood (or the local reading until then),
  // the answers, and once it is built, the routine's own numbers
  const localIntent = useMemo(() => parseIntentKeywords(text), [text]);
  // the minutes shown (the piece and the sentence): the length chosen (answered, or said in the
  // sentence); the routine's real length only when none was chosen
  const minutesShown = built ? shownMinutes(answers.targetMinutes ?? localIntent.targetMinutes, Math.round(built.meta.totalSeconds / 60), { min: MIN_MINUTES, max: MAX_MINUTES }) : null;
  const finaleText = finale && built && intent && minutesShown !== null ? finaleSentence(focusText(intent), minutesShown, intensityLabel(intent.difficulty)) : null;
  const understood = intent ?? heard ?? localIntent;
  const previewRounds = useMemo(() => {
    if (!phoneQuestions || library.length === 0 || built) return null;
    const { meta } = buildRoutine(library, { ...understood, ...answers, targetMinutes: answers.targetMinutes ?? draftMinutes }, () => 0.42);
    return meta.rounds;
  }, [phoneQuestions, library, built, understood, answers, draftMinutes]);
  const blocks = built?.meta.rounds ?? answers.rounds ?? previewRounds;
  const intensityWord = intensityLabel(answers.difficulty ?? understood.difficulty);
  const pieceLabels: Record<PieceId, string> = {
    nose: focusText(understood) || 'tu rutina',
    minutes: `${minutesShown ?? answers.targetMinutes ?? draftMinutes} min`,
    blocks: blocks ? `${blocks} ${blocks === 1 ? 'bloque' : 'bloques'}` : 'bloques',
    engine: intensityWord[0].toUpperCase() + intensityWord.slice(1),
  };

  return (
    <div
      ref={pageRef}
      className={`relative isolate flex min-h-dvh w-full flex-col bg-paper font-[family-name:var(--font-display)] text-ink selection:bg-ink selection:text-white lg:flex-row ${phoneAsk ? 'max-lg:bg-[#2b2a28]' : ''}`}
      style={
        dayC
          ? ({ '--pad-day': 1, '--pad-day-ms': `${reducedMotion ? 0 : FINALE.cSkyMs}ms` } as CSSProperties)
          : undefined
      }
    >
      {/* phone, C: the day over the start screen's dark page (the base turns to day with it) */}
      {phoneAsk && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 lg:hidden"
          style={{ background: PAGE_DAY, opacity: dayC ? 1 : 0, transition: `opacity ${reducedMotion ? 0 : FINALE.cSkyMs}ms ease-in-out` }}
        />
      )}
      <header className="absolute inset-x-0 top-0 z-10 box-content flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        {/* (phone: no way back from the questions or the finale; the brand stays at the top) */}
        {view !== 'ask' && desktop ? (
          <button
            type="button"
            onClick={backToAsk}
            className={`-ml-2 flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 text-[15px] font-medium text-ink/75 hover:text-ink ${focusRing}`}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            Cambiar
          </button>
        ) : (
          <span className={`text-lg font-bold tracking-tight max-lg:transition-colors max-lg:duration-[1200ms] ${darkTop ? 'max-lg:text-white' : 'max-lg:text-ink'}`}>Everyday M</span>
        )}
        {onOpenStudio && !(finale && !desktop) && (
          <button
            type="button"
            onClick={onOpenStudio}
            aria-label="Estudio y modo avanzado"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-ink/65 hover:bg-ink/10 hover:text-ink ${focusRing} ${
              darkTop ? 'max-lg:text-white/75 max-lg:hover:bg-white/10 max-lg:hover:text-white max-lg:focus-visible:outline-white' : ''
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
          phoneAsk ? 'max-lg:pointer-events-none max-lg:absolute max-lg:inset-x-0 max-lg:top-0 max-lg:opacity-0' : view === 'questions' ? 'max-lg:hidden' : ''
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

      {/* (the start screen; on a phone it stays a moment over the questions as they open, fading away
          over the very same dawn: only its own things leave) */}
      {(view === 'ask' || askLeaving) && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          // (phone: what the nose and its crane take, for the height's sharing in .start-fit; while
          // typing, its height held in px, and the base's share with it)
          style={
            desktop
              ? undefined
              : ({ '--bar-room': `${Math.round(bar.height + noseCraneReach(bar.g) + 12)}px`, ...(heldHeight !== null ? { height: `${heldHeight}px`, '--pad-dvh': `${heldHeight / 100}px` } : {}) } as CSSProperties)
          }
          className={`start-fit mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 pb-8 sm:px-8 lg:px-16 max-lg:h-dvh max-lg:justify-start max-lg:gap-0 max-lg:pb-0 max-lg:pt-[calc(4rem+env(safe-area-inset-top))] ${
            view !== 'ask' ? 'asm-leave max-lg:pointer-events-none max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:z-30' : ''
          }`}
          aria-hidden={view !== 'ask' ? true : undefined}
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
          <h1 className={`relative z-10 mt-1 shrink-0 text-[length:var(--slogan-px)] font-semibold leading-[1.04] tracking-[-0.03em] text-white transition-opacity duration-700 lg:hidden ${dayC ? 'opacity-0' : ''}`}>
            ¿Te quieres
            <br />
            poner como
            <br />
            <span className="text-heat">un cohete?</span>
          </h1>
          <div className={`relative min-h-0 flex-1 transition-opacity duration-700 lg:hidden ${dayC ? 'opacity-0' : ''}`}>
            {/* (between the slogan and the crane's arm over the nose, clear of both, as big as fits) */}
            <div
              ref={portholeBoxRef}
              className="absolute inset-x-0 top-[6px] flex items-center justify-center"
              // (typing, with too little room over the keyboard: it gives way from its top as the nose comes up)
              style={{
                bottom: Math.round(noseCraneReach(bar.g) + 6),
                transformOrigin: '50% 0',
                transform: docked && docked.portholeScale < 1 ? `scale(${docked.portholeScale.toFixed(3)})` : undefined,
                opacity: docked && docked.portholeScale < 0.5 ? docked.portholeScale * 2 : undefined,
                transition: reducedMotion ? undefined : `transform ${NOSE_DOCK.moveMs}ms ease-out, opacity ${NOSE_DOCK.moveMs}ms ease-out`,
              }}
            >
              <Porthole clip={standIn} neutral={typing || text.trim() !== ''} className="relative aspect-square h-[min(100%,88vw)] shrink-0" />
            </div>
          </div>

          {/* on a phone the bar is the rocket: the field is its hull, "send" sits at the front */}
          <div
            ref={barRef}
            style={barVars}
            className={`flex items-end gap-2 rounded-[28px] bg-white p-2 pl-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)] max-lg:relative max-lg:-mx-2 max-lg:mb-3 max-lg:block max-lg:h-[var(--bar-h)] max-lg:shrink-0 max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none ${dayC ? 'max-lg:opacity-0 max-lg:transition-opacity max-lg:duration-700' : ''}`}
          >
            {/* (phone: the nose piece you write in, hanging from the crane) */}
            {!desktop && <NoseCrane g={bar.g} hang={bar.hangLeft} width={barPx} reach={12} />}
            <PadRocket
              g={bar.g}
              parts={{ flame: false, fins: false, hatch: false, tail: false }}
              className="nose-bar pointer-events-none absolute left-[var(--fig-l)] top-0 lg:hidden"
            />
            <label htmlFor="routine-prompt" className="sr-only">
              Describe tu rutina
            </label>
            <textarea
              id="routine-prompt"
              rows={1}
              // (phone: one line, never wrapped; it scrolls to the caret)
              wrap={desktop ? undefined : 'off'}
              maxLength={500}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              // (phone: a tap focuses it without the browser scrolling the page to it)
              onTouchEnd={(e) => {
                const field = e.currentTarget;
                if (desktop || document.activeElement === field) return;
                e.preventDefault();
                field.focus({ preventScroll: true });
                field.setSelectionRange(field.value.length, field.value.length);
              }}
              onFocus={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                // (phone: the crane holding the nose creaks a little; inside the tap, so the sound may wake)
                if (!typing && !window.matchMedia(DESKTOP).matches) creatorSfx('noseCreak', { gesture: true });
                setTyping(true);
                // (phone: hold the page's height before the keyboard can squeeze it)
                const form = formRef.current;
                if (form && !window.matchMedia(DESKTOP).matches) setHeldHeight((held) => held ?? form.offsetHeight);
              }}
              onBlur={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                if (launching.current) return; // sent: the crew are boarding, nothing comes down
                blurTimer.current = setTimeout(() => {
                  setTyping(false);
                  setHeldHeight(null);
                }, 250);
              }}
              placeholder={desktop ? 'Hombros, 20 minutos' : PHONE_PLACEHOLDER}
              className={`field-sizing-content max-h-40 min-h-12 flex-1 resize-none bg-transparent py-3 text-lg font-medium text-ink caret-ink placeholder:text-ink/50 focus:outline-none max-lg:absolute max-lg:left-[var(--txt-l)] max-lg:top-[var(--txt-t)] max-lg:h-[var(--txt-h)] max-lg:max-h-none max-lg:min-h-0 max-lg:w-[var(--txt-w)] max-lg:flex-none max-lg:overflow-hidden max-lg:whitespace-pre max-lg:rounded-lg max-lg:py-[10px] max-lg:text-[length:max(16px,var(--txt-px))] max-lg:leading-6 max-lg:caret-heat max-lg:[field-sizing:fixed] max-lg:[clip-path:inset(8px_0)] max-lg:[scrollbar-width:none] max-lg:placeholder:text-[length:var(--ph-px)] max-lg:placeholder:text-[#888780] max-lg:focus-visible:bg-ink/[0.04] ${noseCopy ? 'max-lg:text-transparent' : ''}`}
            />
            {/* (phone, while not typed in: the sentence at its fitted size, cut with «…» if it must be;
                the field itself never goes under 16 px, or iOS would zoom in on focus) */}
            {noseCopy && (
              <span aria-hidden="true" className="pointer-events-none absolute left-[var(--txt-l)] top-[var(--txt-t)] h-[var(--txt-h)] w-[var(--txt-w)] overflow-hidden whitespace-pre py-[10px] text-[length:var(--txt-px)] font-medium leading-6 text-ink lg:hidden">
                {noseCopy.text}
              </span>
            )}
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

          {/* phone: the rocket base, the suggestions on its drum and the red "Random" button; it stays
              while the keyboard is up (the crew then wait on the bar's top) */}
          <div
            className={`-mx-5 shrink-0 sm:-mx-8 lg:hidden ${docked ? 'pointer-events-none opacity-0' : ''} ${reducedMotion ? '' : 'transition-opacity duration-[280ms]'}`}
            // (typing: the keyboard covers it; nothing in it can be reached meanwhile)
            inert={docked ? true : undefined}
          >
            <LaunchBase
              key={baseKey}
              suggestions={drum}
              initialIndex={drumCentre}
              onCentre={setDrumCentre}
              onLaunchStart={(suggestion) => {
                launching.current = true;
                // (path C: a suggestion that says it all takes off into the finale; inside the tap)
                if (isPhone() && questionsFor(suggestion).length === 0) beginAuto(suggestion, !reducedMotion);
              }}
              liftGate={(go, hold) => {
                const f = finaleRef.current;
                if (!f || f.path !== 'C' || !f.viaBase) return false;
                gateRef.current = go;
                holdRef.current = { ...hold, uprightAt: performance.now() + hold.uprightInMs };
                return true;
              }}
              onLiftOff={liftOff}
              onLaunch={(suggestion) => submit(suggestion, null, true)}
              onRandom={(centre) => {
                const pick = randomLanding({ bank: SUGGESTIONS, drum, centre, recent: randomRecent.current });
                if (pick) randomRecent.current = pick.recent;
                return pick;
              }}
              onSwap={(index, sentence) => setDrumSwaps((swaps) => ({ ...swaps, [index]: sentence }))}
            />
          </div>
        </form>
      )}
      {view === 'ask' ? null : phoneQuestions ? (
        // phone: the questions on the left, their answers as the very pieces they fit; on the right
        // the routine's rocket is built, a piece per answer, in the dawn that turns to day; then it
        // takes off by itself
        <AssemblyScene
          noseHidden={carry !== null}
          onNose={setNoseSpot}
          target={fitted}
          modes={pieceModes(questionIds, answeredCount)}
          labels={pieceLabels}
          sky={sky}
          // (the last change of clothes is the ending's, in the big porthole)
          outfit={Math.min(sky, 2) as Outfit}
          ending={finale?.path === 'B' && finale.phase !== 'wait'}
          onAssembled={onAssembled}
          onLiftOff={liftOff}
          take={pending}
          onTaken={pieceTaken}
          onFitted={pieceFitted}
          // (blocks, intensity: the crane's hook drifts over the loose answers until one is tapped)
          picking={!pending && !finale && questions[asked] && questions[asked].id !== 'minutes' ? (questions[asked].id === 'intensity' ? 'engine' : 'blocks') : null}
          // (the minutes: a truck brings the tank you slide; the crane's hook is the button)
          minutes={
            !finale && questions[asked]?.id === 'minutes'
              ? {
                  value: draftMinutes,
                  onChange: setDraftMinutes,
                  hidden: pending?.piece === 'minutes' && pending.taken,
                  onHook: (tank, button) => {
                    if (pending || tease({ kind: 'minutes', minutes: draftMinutes }, button)) return;
                    answerWith({ targetMinutes: draftMinutes }, 'minutes', tank, `${draftMinutes} min`, true);
                  },
                }
              : null
          }
        >
          {(L, ink) =>
            finale?.path === 'B' && finaleText ? (
              <motion.p
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
                aria-live="polite"
                className={`pt-2 text-ink ${FINALE_SENTENCE}`}
                // (the porthole leaves the top for the corner below: the sentence takes the column)
                style={{ maxWidth: L.column.right - L.column.left }}
              >
                {finaleText}
              </motion.p>
            ) : asked >= questions.length ? null : (
              <div className="flex flex-col gap-5">
                <div style={{ minHeight: L.column.titleMin }}>
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
                          style={{ maxWidth: L.column.titleWidth }}
                        >
                          <h1
                            className={`text-balance text-[clamp(2.45rem,8vw,4rem)] font-semibold leading-[1] tracking-[-0.035em] transition-colors duration-[1200ms] ${ink ? 'text-ink' : 'text-white'}`}
                            // (beside the big porthole: a little smaller only if a word would not fit)
                            style={{ fontSize: titleSize(q.title, L.column.titleWidth, measureText) < TITLE_PX.max ? `${titleSize(q.title, L.column.titleWidth, measureText)}px` : undefined }}
                          >
                            {q.title}
                          </h1>
                          {/* what to do: the pieces are the answers (the minutes' tank shows it by itself) */}
                          {q.id !== 'minutes' && (
                            <p className={`mt-2.5 text-[15px] font-medium transition-colors duration-[1200ms] ${ink ? 'text-ink/65' : 'text-white/80'}`}>Toca una pieza</p>
                          )}
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </div>
                {questions[asked]?.id === 'minutes' ? null : questions[asked] ? (
                  <div key={questions[asked].id} className="flex flex-col items-start gap-3">
                    {questions[asked].options.map((option, i) => {
                      const q = questions[asked];
                      const piece: PieceId = q.id === 'intensity' ? 'engine' : 'blocks';
                      const mine = pending?.label === option.label;
                      return (
                        <LoosePiece
                          key={option.label}
                          piece={piece}
                          L={L}
                          label={option.label}
                          measure={measureText}
                          index={i}
                          hidden={mine && pending?.taken}
                          faded={Boolean(pending) && !mine}
                          raised
                          onClick={(e) => {
                            if (pending) return;
                            const difficulty = q.id === 'intensity' ? option.patch.difficulty : undefined;
                            if (difficulty !== undefined && tease({ kind: 'intensity', difficulty }, e.currentTarget)) return;
                            answerWith(option.patch, piece, e.currentTarget, option.label);
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}
                {/* (no «Saltar» on the phone: whoever is here decides) */}
              </div>
            )
          }
        </AssemblyScene>
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

      {/* phone: the typed sentence's nose, carried by the crane to the questions' rocket */}
      {carry && noseSpot && !desktop && (
        <NoseCarry
          from={carry.from}
          g={bar.g}
          text={carry.text}
          textLeft={bar.textLeft + bar.hangLeft}
          textTop={bar.fieldTop + PAD_BAR.PAD}
          textWidth={bar.textWidth}
          to={noseSpot}
          onDone={() => setCarry(null)}
        />
      )}

      <CreatorJoke joke={joke} shakeTarget={pageRef} onDone={() => setJoke(null)} />

      {/* phone: the finale's sentence (C: written in the sky here), «Cambiar», the smoke */}
      {finale && !desktop && finale.phase !== 'wait' && (
        <LaunchFinale
          phase={finale.phase}
          sentence={finale.path === 'C' ? finaleText : null}
          dress={finale.path === 'C' ? (finale.dress ?? null) : null}
          smokeFrom={finale.smokeFrom}
          reduced={Boolean(reducedMotion)}
        />
      )}
    </div>
  );
}

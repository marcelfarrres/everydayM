'use client';

import { useState, useRef, useSyncExternalStore } from 'react';
import { parseIntentKeywords } from '@/lib/intent/keywords';
import type { RoutineIntentResponse } from '@/lib/intent/types';
import type {
  MuscleId,
  MuscleRole,
  MuscleSelection,
  RoutineIntent,
  RoutineIntentMuscle,
} from '@/types/workout';
import {
  ALL_MUSCLE_IDS,
  MUSCLE_LABELS,
  MiniMuscleMap,
} from '@/components/workout/MiniMuscleMap';
import {
  Mic,
  MicOff,
  Sparkles,
  Play,
  Loader2,
  Clock,
  Flame,
  Gauge,
  Plus,
  X,
  Wand2,
  Check,
} from 'lucide-react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const EXAMPLE_PROMPTS = [
  'Full body con enfoque en brazos, 40 minutos',
  'Piernas y glúteos intenso, 30 minutos',
  'Espalda, pecho y abdomen nivel medio, 25 minutos',
];

export function fallbackParseIntent(
  rawText: string,
  externalParser?: (text: string) => RoutineIntent,
): RoutineIntent {
  try {
    return (externalParser ?? parseIntentKeywords)(rawText);
  } catch {
    // continue to built-in safe fallback
  }

  const text = rawText.toLowerCase();
  const musclesMap = new Map<MuscleId, RoutineIntentMuscle>();

  const addMuscles = (ids: MuscleId[], role: MuscleRole, weight: number) => {
    for (const id of ids) {
      const existing = musclesMap.get(id);
      if (!existing || (role === 'primary' && existing.role !== 'primary')) {
        musclesMap.set(id, { id, role, weight });
      }
    }
  };

  const isFullBody =
    text.includes('full body') ||
    text.includes('cuerpo completo') ||
    text.includes('todo el cuerpo');

  if (isFullBody) {
    addMuscles(
      [
        'pectorales',
        'dorsales',
        'cuadriceps',
        'gluteos',
        'abdominales',
        'hombros',
      ],
      'secondary',
      0.6,
    );
  }

  const focusMatch =
    text.match(/enfoque en\s+([a-záéíóúñ\s,y]+)/i) ||
    text.match(/prioridad en\s+([a-záéíóúñ\s,y]+)/i) ||
    text.match(/centrado en\s+([a-záéíóúñ\s,y]+)/i);
  const focusClause = focusMatch ? focusMatch[1].toLowerCase() : text;

  const checkGroup = (keywords: string[], ids: MuscleId[]) => {
    const mentionedInText = keywords.some((kw) => text.includes(kw));
    if (!mentionedInText) return;
    const isPrimary =
      !isFullBody || keywords.some((kw) => focusClause.includes(kw));
    addMuscles(ids, isPrimary ? 'primary' : 'secondary', isPrimary ? 1.0 : 0.65);
  };

  checkGroup(['brazo', 'brazos'], ['biceps', 'triceps', 'hombros', 'antebrazos']);
  checkGroup(['biceps', 'bíceps'], ['biceps']);
  checkGroup(['triceps', 'tríceps'], ['triceps']);
  checkGroup(['hombro', 'hombros', 'deltoides'], ['hombros']);
  checkGroup(['pecho', 'pectoral', 'pectorales'], ['pectorales']);
  checkGroup(['espalda', 'dorsal', 'dorsales', 'lumbar', 'trapecio'], [
    'dorsales',
    'trapecio',
    'lumbares',
  ]);
  checkGroup(['pierna', 'piernas', ' tren inferior'], [
    'cuadriceps',
    'isquiotibiales',
    'gemelos',
    'aductores',
  ]);
  checkGroup(['cuadriceps', 'cuádriceps'], ['cuadriceps']);
  checkGroup(['isquio', 'femoral'], ['isquiotibiales']);
  checkGroup(['gemelo', 'gemelos', 'pantorrilla'], ['gemelos']);
  checkGroup(['gluteo', 'glúteo', 'gluteos', 'glúteos'], ['gluteos']);
  checkGroup(['abdomen', 'abdominal', 'abdominales', 'core', 'oblicuos'], [
    'abdominales',
    'oblicuos',
  ]);

  if (musclesMap.size === 0) {
    addMuscles(['pectorales', 'cuadriceps', 'abdominales', 'dorsales'], 'primary', 0.9);
  } else if (!Array.from(musclesMap.values()).some((m) => m.role === 'primary')) {
    const first = musclesMap.values().next().value;
    if (first) {
      musclesMap.set(first.id, { ...first, role: 'primary', weight: 1.0 });
    }
  }

  let targetMinutes: number | null = 30;
  const minMatch =
    text.match(/(\d{1,3})\s*(?:min|minutos|m\b)/i) ||
    text.match(/(\d{1,2})\s*hora/i);
  if (minMatch) {
    const val = Number(minMatch[1]);
    targetMinutes = text.includes('hora') ? val * 60 : Math.min(90, Math.max(10, val));
  }

  let difficulty = 6;
  if (
    text.includes('suave') ||
    text.includes('fácil') ||
    text.includes('facil') ||
    text.includes('principiante') ||
    text.includes('ligero')
  ) {
    difficulty = 4;
  } else if (
    text.includes('intenso') ||
    text.includes('duro') ||
    text.includes('avanzado') ||
    text.includes('extremo') ||
    text.includes('fuerte') ||
    text.includes('caña')
  ) {
    difficulty = 8;
  }

  const slotMatch = text.match(/(\d{2})\s*(?:seg|segundos|s\b)/i);
  const slotSeconds = slotMatch
    ? Math.min(90, Math.max(25, Number(slotMatch[1])))
    : difficulty >= 8
      ? 55
      : difficulty <= 4
        ? 40
        : 50;

  const includeWarmup = !(
    text.includes('sin calentamiento') || text.includes('no calentar')
  );

  const primaryLabels = Array.from(musclesMap.values())
    .filter((m) => m.role === 'primary')
    .slice(0, 3)
    .map((m) => MUSCLE_LABELS[m.id]);

  const focusLabel = isFullBody
    ? primaryLabels.length > 0
      ? `Full body · enfoque ${primaryLabels.join(', ').toLowerCase()}`
      : 'Full body completo'
    : primaryLabels.length > 0
      ? `Enfoque en ${primaryLabels.join(' y ')}`
      : 'Rutina personalizada';

  return {
    muscles: Array.from(musclesMap.values()),
    difficulty,
    targetMinutes,
    slotSeconds,
    includeWarmup,
    focusLabel,
  };
}

const subscribeNoop = () => () => {};
const getSpeechSupportedSnapshot = () =>
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
      .SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).webkitSpeechRecognition,
  );
const getSpeechSupportedServerSnapshot = () => false;

interface RoutinePromptCardProps {
  loading: boolean;
  onStartIntent: (intent: RoutineIntent) => void;
  keywordParser?: (text: string) => RoutineIntent;
}

export function RoutinePromptCard({
  loading,
  onStartIntent,
  keywordParser,
}: RoutinePromptCardProps) {
  const [promptText, setPromptText] = useState(EXAMPLE_PROMPTS[0]);
  const [analyzing, setAnalyzing] = useState(false);
  const [intent, setIntent] = useState<RoutineIntent>(() =>
    fallbackParseIntent(EXAMPLE_PROMPTS[0], keywordParser),
  );
  const [intentSource, setIntentSource] = useState<'gemini' | 'keywords' | null>(
    'keywords',
  );
  const [showAddMuscle, setShowAddMuscle] = useState(false);

  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    getSpeechSupportedSnapshot,
    getSpeechSupportedServerSnapshot,
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleToggleVoice = () => {
    if (typeof window === 'undefined') return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = true;

      const baseText = promptText.trim();

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const nextText = baseText
          ? `${baseText} ${transcript.trim()}`
          : transcript.trim();
        setPromptText(nextText);
      };

      recognition.onerror = () => {
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const analyzeRoutineText = async (textToAnalyze: string) => {
    const trimmed = textToAnalyze.trim();
    if (!trimmed) return;

    setAnalyzing(true);
    try {
      const response = await fetch('/api/routine-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed.slice(0, 500) }),
      });

      if (response.ok) {
        const data = (await response.json()) as RoutineIntentResponse;
        if (data?.intent && Array.isArray(data.intent.muscles)) {
          setIntent(data.intent);
          setIntentSource(data.source ?? 'gemini');
          return;
        }
      }

      const fallback = (keywordParser ?? parseIntentKeywords)(trimmed);
      setIntent(fallback);
      setIntentSource('keywords');
    } catch {
      const fallback = (keywordParser ?? parseIntentKeywords)(trimmed);
      setIntent(fallback);
      setIntentSource('keywords');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleMuscleRole = (id: MuscleId) => {
    setIntent((prev) => ({
      ...prev,
      muscles: prev.muscles.map((m) =>
        m.id === id
          ? {
              ...m,
              role: m.role === 'primary' ? 'secondary' : 'primary',
              weight: m.role === 'primary' ? 0.6 : 1.0,
            }
          : m,
      ),
    }));
  };

  const removeMuscle = (id: MuscleId) => {
    setIntent((prev) => {
      const remaining = prev.muscles.filter((m) => m.id !== id);
      if (
        remaining.length > 0 &&
        !remaining.some((m) => m.role === 'primary')
      ) {
        remaining[0] = { ...remaining[0], role: 'primary', weight: 1.0 };
      }
      return { ...prev, muscles: remaining };
    });
  };

  const addMuscle = (id: MuscleId) => {
    setIntent((prev) => {
      if (prev.muscles.some((m) => m.id === id)) return prev;
      return {
        ...prev,
        muscles: [...prev.muscles, { id, role: 'primary', weight: 1.0 }],
      };
    });
    setShowAddMuscle(false);
  };

  const muscleSelections: MuscleSelection[] = intent.muscles.map((m) => ({
    id: m.id,
    role: m.role,
  }));

  const availableToAdd = ALL_MUSCLE_IDS.filter(
    (id) => !intent.muscles.some((m) => m.id === id),
  );

  return (
    <div className="space-y-3.5">
      {/* Textarea + Mic Input */}
      <div className="rounded-3xl border border-[#22c55e]/35 bg-[#121914]/95 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label
            htmlFor="routine-prompt-textarea"
            className="text-xs font-black uppercase tracking-[0.16em] text-[#4ade80] flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" /> Describe tu rutina
          </label>
          {speechSupported && (
            <button
              type="button"
              onClick={handleToggleVoice}
              aria-label={
                listening ? 'Detener dictado por voz' : 'Dictar rutina por voz'
              }
              aria-pressed={listening}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                listening
                  ? 'bg-red-500/20 border border-red-400 text-red-300 animate-pulse'
                  : 'bg-[#1a241d] border border-[#22c55e]/30 text-neutral-200 hover:border-[#4ade80] hover:text-white'
              }`}
            >
              {listening ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-red-400" />
                  Escuchando...
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-[#4ade80]" />
                  Dictar por voz
                </>
              )}
            </button>
          )}
        </div>

        <div className="relative">
          <textarea
            id="routine-prompt-textarea"
            rows={2}
            maxLength={500}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Ej.: Full body con enfoque en brazos, 40 minutos, intensidad alta..."
            className="w-full resize-none rounded-2xl border border-white/15 bg-[#0a0e0b] px-3.5 py-2.5 text-sm font-medium text-white placeholder:text-neutral-400 focus:border-[#4ade80] focus:outline-none focus:ring-2 focus:ring-[#4ade80]/30"
          />
        </div>

        {/* Quick examples + Analyze CTA */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mr-1">
              Ejemplos:
            </span>
            {EXAMPLE_PROMPTS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setPromptText(sample);
                  void analyzeRoutineText(sample);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-colors hover:border-[#4ade80]/40 hover:bg-[#22c55e]/15 hover:text-white"
              >
                {sample}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={analyzing || !promptText.trim()}
            onClick={() => void analyzeRoutineText(promptText)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-[#22c55e]/50 bg-[#1a291e] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[#4ade80] transition-all hover:bg-[#22c55e] hover:text-black disabled:opacity-40"
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Interpretar rutina
          </button>
        </div>
      </div>

      {/* Editable Parsed Intent Chips */}
      <div className="rounded-3xl border border-[#22c55e]/30 bg-[#111713]/95 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-neutral-300 block">
              Parámetros detectados · Toca para ajustar
            </span>
            <p className="text-base font-black uppercase tracking-tight text-white mt-0.5">
              {intent.focusLabel}
            </p>
          </div>
          {intentSource && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#4ade80]">
              <Check className="w-3 h-3" />
              {intentSource === 'gemini' ? 'IA Gemini' : 'Detector Inteligente'}
            </span>
          )}
        </div>

        {/* Parameter chips row: Duration, Difficulty, Slot, Warmup */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Duration chips */}
          <div className="rounded-2xl border border-white/10 bg-[#0c110e] p-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-300 mb-1.5">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Clock className="w-3.5 h-3.5 text-[#4ade80]" /> Duración objetivo
              </span>
              <span className="font-black text-[#4ade80]">
                {intent.targetMinutes ?? 30} min
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {[15, 25, 30, 40, 45].map((mins) => {
                const active = (intent.targetMinutes ?? 30) === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() =>
                      setIntent((prev) => ({ ...prev, targetMinutes: mins }))
                    }
                    className={`rounded-lg px-2.5 py-1 text-xs font-black transition-colors ${
                      active
                        ? 'bg-[#22c55e] text-black'
                        : 'bg-white/5 text-neutral-200 hover:bg-white/10'
                    }`}
                  >
                    {mins}m
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty & Slot chips */}
          <div className="rounded-2xl border border-white/10 bg-[#0c110e] p-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-300 mb-1.5">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Gauge className="w-3.5 h-3.5 text-[#4ade80]" /> Intensidad y Slot
              </span>
              <span className="font-black text-[#4ade80]">
                Nivel {intent.difficulty}/10 · {intent.slotSeconds ?? 50}s
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                {[3, 5, 7, 9].map((lvl) => {
                  const active = intent.difficulty === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() =>
                        setIntent((prev) => ({ ...prev, difficulty: lvl }))
                      }
                      className={`rounded-lg px-2 py-1 text-xs font-black transition-colors ${
                        active
                          ? 'bg-[#22c55e] text-black'
                          : 'bg-white/5 text-neutral-200 hover:bg-white/10'
                      }`}
                    >
                      Nv.{lvl}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                {[40, 50, 60].map((slot) => {
                  const active = (intent.slotSeconds ?? 50) === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() =>
                        setIntent((prev) => ({ ...prev, slotSeconds: slot }))
                      }
                      className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                        active
                          ? 'border border-[#4ade80] bg-[#22c55e]/20 text-[#4ade80]'
                          : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {slot}s
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Muscles chips + Mini Muscle Map preview */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0c110e] p-3">
          <div className="flex-1 space-y-2 w-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-300">
                Músculos (toca 1º/2º)
              </span>
              <button
                type="button"
                onClick={() =>
                  setIntent((prev) => ({
                    ...prev,
                    includeWarmup: !prev.includeWarmup,
                  }))
                }
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors ${
                  intent.includeWarmup
                    ? 'bg-amber-500/20 border border-amber-400/50 text-amber-300'
                    : 'bg-white/5 border border-white/10 text-neutral-300'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                {intent.includeWarmup ? 'Con calentamiento' : 'Sin calentamiento'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {intent.muscles.map((m) => {
                const isPrimary = m.role === 'primary';
                return (
                  <div
                    key={m.id}
                    className={`inline-flex items-center rounded-full border text-[11px] font-bold transition-all ${
                      isPrimary
                        ? 'border-[#4ade80] bg-[#22c55e]/20 text-white'
                        : 'border-yellow-400/50 bg-yellow-400/15 text-yellow-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleMuscleRole(m.id)}
                      className="px-2 py-0.5 flex items-center gap-1"
                      title="Cambiar entre músculo principal y secundario"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isPrimary ? 'bg-[#22c55e]' : 'bg-yellow-400'
                        }`}
                      />
                      <span>{MUSCLE_LABELS[m.id]}</span>
                      <span className="opacity-80">
                        ({isPrimary ? '1º' : '2º'})
                      </span>
                    </button>
                    {intent.muscles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMuscle(m.id)}
                        aria-label={`Quitar ${MUSCLE_LABELS[m.id]}`}
                        className="pr-1.5 pl-0.5 py-0.5 text-neutral-300 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {availableToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddMuscle((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#22c55e]/50 bg-[#141b16] px-2 py-0.5 text-[11px] font-bold text-[#4ade80] hover:bg-[#22c55e]/15"
                >
                  <Plus className="w-3 h-3" /> Añadir
                </button>
              )}
            </div>

            {showAddMuscle && availableToAdd.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1.5 border-t border-white/10">
                {availableToAdd.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => addMuscle(id)}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-200 hover:bg-[#22c55e] hover:text-black transition-colors"
                  >
                    + {MUSCLE_LABELS[id]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 mx-auto sm:mx-0 bg-[#111713] rounded-2xl p-1.5 border border-white/10">
            <MiniMuscleMap muscles={muscleSelections} size="sm" />
          </div>
        </div>

        {/* Start Workout CTA */}
        <button
          type="button"
          disabled={loading || intent.muscles.length === 0}
          onClick={() => onStartIntent(intent)}
          className="w-full bg-[#22c55e] hover:bg-[#4ade80] text-black font-black uppercase tracking-wider py-3.5 px-6 rounded-2xl transition-all shadow-[0_10px_30px_rgba(34,197,94,0.35)] flex items-center justify-center gap-2.5 text-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-black" />
          ) : (
            <Play className="w-5 h-5 fill-black" />
          )}
          Comenzar Entrenamiento ({intent.targetMinutes ?? 30} min)
        </button>
      </div>
    </div>
  );
}

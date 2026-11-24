'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Send } from 'lucide-react';
import type { ClipQueueItem, CreateClipBody } from '@/lib/clips/queue';
import { CLIP_TYPE_DESCRIPTIONS, CLIP_TYPE_LENGTHS, CLIP_TYPE_NAMES, IMPLEMENTED_CLIP_TYPES, clipNeedsTalk, type ClipType } from '@/lib/clips/types';
import type { MuscleId } from '@/types/workout';
import type { StudioExercise } from '@/types/studio';
import { FOCUS, fieldClass, type BannerMessage } from '@/components/studio/StudioUi';
import { jsonBody, studioJson } from '@/components/studio/studioClient';
import { CLIPS_API, ClipsQueue, type ClipAction } from '@/components/studio/ClipsQueue';

/*
 * Clips for TikTok: write what you want (or pick it by hand), the Studio renders it in the
 * background and it lands in the queue to watch, approve or reject, and download.
 */

const MUSCLE_GROUPS: Array<{ label: string; ids: MuscleId[] }> = [
  { label: 'Glúteos', ids: ['gluteos'] },
  { label: 'Piernas', ids: ['cuadriceps', 'isquiotibiales', 'gemelos', 'aductores'] },
  { label: 'Pecho', ids: ['pectorales'] },
  { label: 'Espalda', ids: ['dorsales', 'trapecio', 'lumbares'] },
  { label: 'Hombros', ids: ['hombros'] },
  { label: 'Brazos', ids: ['biceps', 'triceps', 'antebrazos'] },
  { label: 'Abdominales', ids: ['abdominales', 'oblicuos'] },
];

const MINUTES = [10, 15, 20, 30, 40];
const HANDLE_KEY = 'everydaym.tiktok.handle';

const SOURCE_LABEL = { gemini: 'Gemini', keywords: 'palabras clave' } as const;

function readHandle(): string {
  try {
    return window.localStorage.getItem(HANDLE_KEY) || '@everydaym';
  } catch {
    return '@everydaym';
  }
}

function saveHandle(value: string) {
  try {
    window.localStorage.setItem(HANDLE_KEY, value);
  } catch {
    // private mode: the default handle is used next time
  }
}

export function ClipsView({
  exercises,
  notify,
  handleError,
}: {
  exercises: StudioExercise[];
  notify: (message: BannerMessage | null) => void;
  handleError: (err: unknown, fallback: string) => string | null;
}) {
  const [items, setItems] = useState<ClipQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sentence, setSentence] = useState('');
  const [sending, setSending] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [type, setType] = useState<ClipType>('talk');
  const [groups, setGroups] = useState<string[]>([]);
  const [exerciseId, setExerciseId] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [handle, setHandle] = useState('@everydaym');

  useEffect(() => {
    // The handle is remembered on this device only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHandle(readHandle());
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await studioJson<{ items: ClipQueueItem[] }>(CLIPS_API, { cache: 'no-store' });
      setItems(data.items);
    } catch (err) {
      const text = handleError(err, 'No se pudo cargar la cola.');
      if (text) notify({ kind: 'error', text });
    } finally {
      setLoading(false);
    }
  }, [handleError, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Follow renders while there are any.
  const rendering = items.some((i) => i.status === 'rendering');
  useEffect(() => {
    if (!rendering) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [rendering, load]);

  const talkExercises = useMemo(() => exercises.filter((e) => (e.talks?.length ?? 0) > 0), [exercises]);
  const muscles = useMemo(() => [...new Set(MUSCLE_GROUPS.filter((g) => groups.includes(g.label)).flatMap((g) => g.ids))], [groups]);

  const create = async (body: CreateClipBody): Promise<boolean> => {
    setSending(true);
    notify(null);
    try {
      const data = await studioJson<{ item: ClipQueueItem; read?: { intent: { type: ClipType }; source: 'gemini' | 'keywords' } }>(
        CLIPS_API,
        jsonBody('POST', { ...body, handle }),
      );
      setItems((prev) => [data.item, ...prev.filter((i) => i.id !== data.item.id)]);
      notify({
        kind: 'success',
        text: data.read
          ? `En la cola: ${CLIP_TYPE_NAMES[data.item.type]}${data.item.exercises.length ? ` · ${data.item.exercises.map((e) => e.title).join(', ')}` : ''} (leído con ${SOURCE_LABEL[data.read.source]}).`
          : `En la cola: ${CLIP_TYPE_NAMES[data.item.type]}.`,
      });
      return true;
    } catch (err) {
      const text = handleError(err, 'No se pudo crear el clip.');
      if (text) notify({ kind: 'error', text });
      return false;
    } finally {
      setSending(false);
    }
  };

  const onAction = async (action: ClipAction): Promise<boolean> => {
    setBusyId(action.id);
    notify(null);
    try {
      if (action.kind === 'delete') {
        await studioJson(`${CLIPS_API}/${action.id}`, { method: 'DELETE' });
        setItems((prev) => prev.filter((i) => i.id !== action.id));
        return true;
      }
      if (action.kind === 'regenerate') {
        // Rejecting with a comment and asking for another version go together.
        if (action.comment.trim()) {
          await studioJson(`${CLIPS_API}/${action.id}/reject`, jsonBody('POST', { comment: action.comment }));
        }
        const data = await studioJson<{ item: ClipQueueItem }>(`${CLIPS_API}/${action.id}/regenerate`, jsonBody('POST', { comment: action.comment }));
        await load();
        notify({ kind: 'success', text: `Otra versión en la cola: ${CLIP_TYPE_NAMES[data.item.type]}.` });
        return true;
      }
      const data = await studioJson<{ item: ClipQueueItem }>(
        `${CLIPS_API}/${action.id}/${action.kind}`,
        jsonBody('POST', action.kind === 'reject' ? { comment: action.comment } : {}),
      );
      setItems((prev) => prev.map((i) => (i.id === data.item.id ? data.item : i)));
      return true;
    } catch (err) {
      const text = handleError(err, 'No se pudo hacer.');
      if (text) notify({ kind: 'error', text });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const chosenExercise = talkExercises.find((e) => e.id === exerciseId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Clips</h1>
        <p className="mt-1 text-[16px] text-ink/55">Para TikTok. Se montan en este ordenador y esperan aquí a que los revises.</p>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (sentence.trim().length < 3 || sending) return;
          if (await create({ sentence })) setSentence('');
        }}
        className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-3"
      >
        <label htmlFor="clip-sentence" className="px-1 text-[13px] font-semibold text-ink/60">
          ¿Qué clip quieres?
        </label>
        <textarea
          id="clip-sentence"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          rows={3}
          maxLength={300}
          placeholder="Ej. un clip de un ejercicio de glúteo donde salgo explicando"
          className="w-full resize-none rounded-xl bg-paper/60 p-3 text-[17px] leading-snug focus:outline-2 focus:outline-ink"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="px-1 text-[13px] leading-snug text-ink/50">Sin música en los cortos: el sonido se pone en TikTok.</p>
          <button
            type="submit"
            disabled={sending || sentence.trim().length < 3}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink pl-4 pr-5 text-[16px] font-semibold text-white disabled:opacity-40 ${FOCUS}`}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Crear
          </button>
        </div>
      </form>

      <section className="rounded-2xl bg-white">
        <button
          type="button"
          onClick={() => setManualOpen((o) => !o)}
          aria-expanded={manualOpen}
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-[16px] font-semibold ${FOCUS}`}
        >
          Elegir a mano
          <ChevronDown className={`h-5 w-5 text-ink/40 transition-transform ${manualOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {manualOpen && (
          <div className="flex flex-col gap-5 border-t border-ink/10 p-4">
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ink/60">Tipo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {IMPLEMENTED_CLIP_TYPES.map((t) => (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${type === t ? 'border-ink' : 'border-ink/15'} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink`}
                  >
                    <input type="radio" name="clip-type" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1 accent-[#131313]" />
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2 text-[15px] font-semibold">
                        {CLIP_TYPE_NAMES[t]}
                        <span className="text-[13px] font-medium tabular-nums text-ink/50">{CLIP_TYPE_LENGTHS[t]}</span>
                      </span>
                      <span className="block text-[13px] leading-snug text-ink/55">{CLIP_TYPE_DESCRIPTIONS[t]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {clipNeedsTalk(type) && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Ejercicio con vídeo hablado</span>
                <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} className={`${fieldClass} border border-ink/15`}>
                  <option value="">Cualquiera de los músculos elegidos</option>
                  {talkExercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.talks.length})
                    </option>
                  ))}
                </select>
                {talkExercises.length === 0 && <span className="mt-1.5 block text-[13px] text-heat">Aún no hay vídeos hablados: súbelos en «Vídeos hablados».</span>}
              </label>
            )}

            {!(clipNeedsTalk(type) && exerciseId) && (
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold text-ink/60">Músculos (ninguno = cualquiera)</legend>
                <div className="flex flex-wrap gap-2">
                  {MUSCLE_GROUPS.map((g) => {
                    const on = groups.includes(g.label);
                    return (
                      <button
                        key={g.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setGroups((prev) => (on ? prev.filter((x) => x !== g.label) : [...prev, g.label]))}
                        className={`h-10 rounded-full border px-4 text-[14px] font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink/70'} ${FOCUS}`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {type === 'full' && (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Minutos</span>
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${fieldClass} border border-ink/15`}>
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex items-center gap-3 rounded-xl border border-ink/15 px-4">
              <span className="text-[14px] font-medium text-ink/55">Tu usuario</span>
              <input
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  saveHandle(e.target.value);
                }}
                maxLength={30}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-right text-[16px] font-semibold focus:outline-none"
              />
            </label>

            <button
              type="button"
              disabled={sending}
              onClick={() =>
                void create({
                  type,
                  muscles,
                  exerciseId: clipNeedsTalk(type) && chosenExercise ? chosenExercise.id : null,
                  minutes: type === 'full' ? minutes : null,
                  ...(clipNeedsTalk(type) && chosenExercise ? { exerciseTitle: chosenExercise.title } : {}),
                })
              }
              className={`flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-white disabled:opacity-40 ${FOCUS}`}
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Crear {CLIP_TYPE_NAMES[type].toLowerCase()}
            </button>
          </div>
        )}
      </section>

      <ClipsQueue items={items} loading={loading} busyId={busyId} onAction={onAction} />
    </div>
  );
}

'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, Loader2, Mic, Play, Search, Trash2 } from 'lucide-react';
import { playbackUrl } from '@/lib/media';
import type { ExerciseTalk } from '@/types/workout';
import type { StudioExercise } from '@/types/studio';
import { StudioDialog } from '@/components/studio/StudioDialog';
import { FOCUS, Poster, fieldClass, type BannerMessage } from '@/components/studio/StudioUi';
import {
  formatDuration,
  searchable,
  studioJson,
  talkCountLabel,
  uploadFile,
} from '@/components/studio/studioClient';

type Filter = 'all' | 'missing';
type JobStatus = 'waiting' | 'working' | 'done' | 'error';

interface TalkJob {
  id: string;
  exerciseId: string;
  fileName: string;
  status: JobStatus;
  error: string | null;
}

const VIDEO_ACCEPT = 'video/quicktime,video/mp4,video/*,.mov,.mp4,.m4v';

/**
 * Vídeos hablados: go through the exercises (built for the phone, one by one), see which have
 * none, attach one or several, delete one. Uploads keep running while moving to the next.
 */
export function TalksView({
  exercises,
  loading,
  setExercises,
  notify,
  handleError,
  openId,
  setOpenId,
}: {
  exercises: StudioExercise[];
  loading: boolean;
  setExercises: Dispatch<SetStateAction<StudioExercise[]>>;
  notify: (message: BannerMessage | null) => void;
  handleError: (err: unknown, fallback: string) => string | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('missing');
  const [note, setNote] = useState('');
  const [jobs, setJobs] = useState<TalkJob[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const query = searchable(searchQuery.trim());
  const searched = query ? exercises.filter((ex) => searchable(ex.title).includes(query)) : exercises;
  const missingCount = exercises.filter((ex) => ex.talks.length === 0).length;
  const visible = filter === 'missing' ? searched.filter((ex) => ex.talks.length === 0) : searched;
  const current = openId ? exercises.find((ex) => ex.id === openId) ?? null : null;

  const pendingJobs = (exerciseId: string) =>
    jobs.filter((j) => j.exerciseId === exerciseId && (j.status === 'waiting' || j.status === 'working')).length;

  /** The next exercise (in the searched list, after the current one) that still has no talk. */
  const nextMissing = (() => {
    if (!current) return null;
    const start = searched.findIndex((ex) => ex.id === current.id);
    for (let step = 1; step <= searched.length; step += 1) {
      const candidate = searched[(start + step) % searched.length];
      if (candidate.id !== current.id && candidate.talks.length === 0 && pendingJobs(candidate.id) === 0) {
        return candidate;
      }
    }
    return null;
  })();

  const open = (id: string | null) => {
    setPlayingId(null);
    setConfirmDeleteId(null);
    setPanelError(null);
    setNote('');
    setOpenId(id);
  };

  const updateJob = (id: string, patch: Partial<TalkJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  };

  const addTalks = (files: FileList, exerciseId: string) => {
    const videos = Array.from(files).filter((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(f.name));
    if (videos.length === 0) {
      setPanelError('Elige archivos de vídeo (.MOV o .MP4).');
      return;
    }
    setPanelError(null);
    const noteForBatch = note.trim() || null;
    setNote('');

    for (const file of videos) {
      const job: TalkJob = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        exerciseId,
        fileName: file.name,
        status: 'waiting',
        error: null,
      };
      setJobs((prev) => [...prev, job]);
      chain.current = chain.current.then(async () => {
        updateJob(job.id, { status: 'working' });
        try {
          const { talk } = await uploadFile<{ talk: ExerciseTalk }>(
            `/api/admin/exercises/${encodeURIComponent(exerciseId)}/talks`,
            file,
            { note: noteForBatch },
            () => {},
          );
          setExercises((prev) => prev.map((e) => (e.id === exerciseId ? { ...e, talks: [...e.talks, talk] } : e)));
          updateJob(job.id, { status: 'done' });
        } catch (err: unknown) {
          updateJob(job.id, { status: 'error', error: handleError(err, 'No se pudo subir el vídeo hablado') });
        }
      });
    }
  };

  const deleteTalk = async (talk: ExerciseTalk) => {
    setDeletingId(talk.id);
    try {
      await studioJson(`/api/admin/talks/${encodeURIComponent(talk.id)}`, { method: 'DELETE' });
      setExercises((prev) =>
        prev.map((e) => (e.id === talk.exercise_id ? { ...e, talks: e.talks.filter((t) => t.id !== talk.id) } : e)),
      );
      setConfirmDeleteId(null);
      notify({ kind: 'success', text: 'Vídeo hablado borrado.' });
    } catch (err: unknown) {
      setPanelError(handleError(err, 'No se pudo borrar el vídeo hablado'));
    } finally {
      setDeletingId(null);
    }
  };

  const currentJobs = current ? jobs.filter((j) => j.exerciseId === current.id && j.status !== 'done') : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Vídeos hablados</h1>
        <p className="mt-1 text-[16px] text-ink/55">
          {loading ? 'Cargando…' : `${missingCount} de ${exercises.length} ejercicios sin vídeo hablado`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Buscar ejercicio</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar ejercicio"
            className="h-12 w-full rounded-full bg-ink/6 pl-11 pr-4 text-[16px] placeholder:text-ink/40 focus:outline-2 focus:outline-ink"
          />
        </label>
        <div role="radiogroup" aria-label="Filtro" className="flex h-12 shrink-0 rounded-full bg-ink/6 p-1">
          {([
            ['missing', `Sin vídeo hablado (${missingCount})`],
            ['all', 'Todos'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={`flex-auto whitespace-nowrap rounded-full px-4 text-[14px] font-semibold ${filter === value ? 'bg-white text-ink shadow-sm' : 'text-ink/55'} ${FOCUS}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-ink/55">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando…
        </p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-ink/55">
          {filter === 'missing' && !query ? 'Todos los ejercicios tienen vídeo hablado.' : 'Nada con ese nombre.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((ex) => {
            const busy = pendingJobs(ex.id);
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => open(ex.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl bg-white p-2 pr-4 text-left ${FOCUS}`}
                >
                  <Poster src={ex.poster_url} className="aspect-[4/5] w-12 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{ex.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-ink/55">
                      {busy > 0 ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Subiendo {busy}…
                        </>
                      ) : (
                        talkCountLabel(ex.talks.length)
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink/30" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={VIDEO_ACCEPT}
        onChange={(e) => {
          if (e.target.files?.length && current) addTalks(e.target.files, current.id);
          e.target.value = '';
        }}
        className="hidden"
      />

      <StudioDialog
        open={Boolean(current)}
        onClose={() => open(null)}
        label="Vídeos hablados del ejercicio"
        header={
          current && (
            <div className="flex items-center gap-4">
              <Poster src={current.poster_url} className="aspect-[4/5] w-16 shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Vídeos hablados</p>
                <p className="mt-1 break-words text-2xl font-semibold leading-tight tracking-[-0.02em]">{current.title}</p>
              </div>
            </div>
          )
        }
        footer={
          <>
            <button type="button" onClick={() => open(null)} className={`h-12 rounded-full px-4 text-[15px] font-medium text-ink/60 ${FOCUS}`}>
              Cerrar
            </button>
            <button
              type="button"
              disabled={!nextMissing}
              onClick={() => nextMissing && open(nextMissing.id)}
              aria-label="Siguiente ejercicio sin vídeo hablado"
              className={`flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink pl-5 pr-4 text-[15px] font-semibold text-white disabled:opacity-40 ${FOCUS}`}
            >
              Siguiente sin vídeo <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        }
      >
        {current && (
          <>
            {current.talks.length === 0 && currentJobs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink/25 p-4 text-[15px] text-ink/55">
                Este ejercicio aún no tiene vídeo hablado.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {current.talks.map((talk) => (
                  <li key={talk.id} className="rounded-2xl bg-white p-2 pr-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPlayingId(playingId === talk.id ? null : talk.id)}
                        aria-label={playingId === talk.id ? 'Ocultar vídeo' : 'Ver vídeo'}
                        className={`relative shrink-0 overflow-hidden rounded-lg ${FOCUS}`}
                      >
                        <Poster src={talk.poster_url} className="aspect-[4/5] w-12" />
                        <Play className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" aria-hidden="true" />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{talk.note || 'Vídeo hablado'}</span>
                        <span className="block text-[13px] text-ink/55">{formatDuration(talk.duration_seconds)}</span>
                      </span>
                      {confirmDeleteId === talk.id ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === talk.id}
                            onClick={() => void deleteTalk(talk)}
                            className={`flex h-10 items-center gap-1.5 rounded-full bg-heat px-3 text-[14px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                          >
                            {deletingId === talk.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Borrar
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className={`h-10 rounded-full px-2 text-[14px] font-medium text-ink/60 ${FOCUS}`}>
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(talk.id)}
                          aria-label="Borrar este vídeo hablado"
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-ink/6 hover:text-heat ${FOCUS}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {playingId === talk.id && (
                      // Mounted only when asked for: this is the only moment the talk is downloaded.
                      <video
                        src={playbackUrl(talk)}
                        poster={talk.poster_url ?? undefined}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="mx-auto mt-2 max-h-[60dvh] w-full rounded-xl bg-black object-contain"
                      />
                    )}
                  </li>
                ))}
                {currentJobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
                    {job.status === 'error' ? (
                      <Mic className="h-5 w-5 shrink-0 text-heat" aria-hidden="true" />
                    ) : (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ink/50" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{job.fileName}</span>
                      <span className={`block text-[13px] ${job.status === 'error' ? 'text-heat' : 'text-ink/55'}`}>
                        {job.status === 'error' ? job.error : job.status === 'waiting' ? 'En cola' : 'Comprimiendo y subiendo…'}
                      </span>
                    </span>
                    {job.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                        className={`h-10 shrink-0 rounded-full px-3 text-[14px] font-medium text-ink/60 ${FOCUS}`}
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-ink/25 p-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Nota (opcional)</span>
                <input
                  type="text"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. Técnica: codos pegados"
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex h-12 items-center justify-center gap-2 rounded-full bg-ink/8 px-5 text-[16px] font-semibold hover:bg-ink/12 ${FOCUS}`}
              >
                <Mic className="h-5 w-5" aria-hidden="true" /> Añadir vídeos hablados
              </button>
              <p className="text-[13px] text-ink/50">
                Puedes elegir varios a la vez. Se suben de uno en uno; puedes pasar al siguiente ejercicio mientras tanto.
              </p>
            </div>

            {panelError && (
              <p role="alert" className="rounded-2xl bg-heat/10 px-4 py-3 text-[15px] font-medium text-heat">
                {panelError}
              </p>
            )}
          </>
        )}
      </StudioDialog>
    </div>
  );
}

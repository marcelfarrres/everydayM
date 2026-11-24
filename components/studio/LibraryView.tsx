'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, Loader2, Mic, Plus, Search, Trash2 } from 'lucide-react';
import { getExerciseMuscles } from '@/components/workout/MuscleSelector';
import { playbackUrl } from '@/lib/media';
import type { ExerciseTalk } from '@/types/workout';
import type { StudioExercise } from '@/types/studio';
import {
  CLIP_TYPE_LABELS,
  ClipForm,
  clipFieldsProblem,
  toClipType,
  type ClipFields,
  type ClipType,
} from '@/components/studio/ClipForm';
import { StudioDialog } from '@/components/studio/StudioDialog';
import { FOCUS, Poster, type BannerMessage } from '@/components/studio/StudioUi';
import {
  formatBytes,
  jsonBody,
  searchable,
  studioJson,
  talkCountLabel,
  titleFromFilename,
  uploadFile,
} from '@/components/studio/studioClient';

type QueueStatus = 'pending' | 'waiting' | 'compressing' | 'uploading' | 'talk' | 'done' | 'error';

interface QueueItem extends ClipFields {
  id: string;
  file: File;
  previewUrl: string; // local copy to watch before uploading (no network)
  talkFile: File | null; // optional vídeo hablado, uploaded right after the clip
  exerciseId: string | null; // set once the clip is stored: a retry then only sends the talk
  originalSize: number;
  compressedSize: number | null;
  status: QueueStatus;
  error: string | null;
}

const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: 'Sin subir',
  waiting: 'En cola',
  compressing: 'Comprimiendo',
  uploading: 'Subiendo',
  talk: 'Subiendo vídeo hablado',
  done: 'Subido',
  error: 'Error',
};

const VIDEO_ACCEPT = 'video/quicktime,video/mp4,video/*,.mov,.mp4,.m4v';

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
}

type Editor = { kind: 'queue' | 'exercise'; id: string } | null;

export function LibraryView({
  exercises,
  loading,
  setExercises,
  notify,
  handleError,
  onManageTalks,
}: {
  exercises: StudioExercise[];
  loading: boolean;
  setExercises: Dispatch<SetStateAction<StudioExercise[]>>;
  notify: (message: BannerMessage | null) => void;
  handleError: (err: unknown, fallback: string) => string | null;
  onManageTalks: (exerciseId: string) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClipFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const talkInputRef = useRef<HTMLInputElement | null>(null);
  // uploads run one after another, whatever order they are asked in
  const uploads = useRef<Promise<unknown>>(Promise.resolve());

  const updateQueueItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter(isVideoFile);
    if (incoming.length === 0) {
      notify({ kind: 'error', text: 'Selecciona archivos de vídeo válidos (.MOV o .MP4).' });
      return;
    }
    const items: QueueItem[] = incoming.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      talkFile: null,
      exerciseId: null,
      originalSize: file.size,
      compressedSize: null,
      status: 'pending',
      error: null,
      title: titleFromFilename(file.name),
      type: 'workout',
      difficulty: 5,
      muscles: [],
      equipment: 'ninguno',
    }));
    setQueue((prev) => [...prev, ...items]);
    notify(null);
    setEditorError(null);
    setEditor({ kind: 'queue', id: items[0].id });
  };

  const removeQueueItem = (id: string) => {
    const gone = queue.find((item) => item.id === id);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    if (editor?.kind === 'queue' && editor.id === id) setEditor(null);
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const processItem = async (item: QueueItem): Promise<void> => {
    let exerciseId = item.exerciseId;
    try {
      if (!exerciseId) {
        updateQueueItem(item.id, { status: 'compressing', error: null });
        const result = await uploadFile<{ exercise: StudioExercise; compressedSize?: number }>(
          '/api/admin/ingest',
          item.file,
          {
            title: item.title.trim(),
            type: item.type,
            difficulty: item.difficulty,
            muscles: item.type === 'workout' ? item.muscles : [],
            equipment: item.equipment,
          },
          (event) => {
            if (event.phase === 'uploading') {
              updateQueueItem(item.id, { status: 'uploading', compressedSize: event.compressedSize ?? null });
            }
          },
        );
        const created = result.exercise;
        exerciseId = created.id;
        setExercises((prev) => [{ ...created, talks: created.talks ?? [] }, ...prev]);
        updateQueueItem(item.id, { exerciseId: created.id, compressedSize: result.compressedSize ?? null });
      }

      if (item.talkFile) {
        updateQueueItem(item.id, { status: 'talk', error: null });
        const { talk } = await uploadFile<{ talk: ExerciseTalk }>(
          `/api/admin/exercises/${encodeURIComponent(exerciseId)}/talks`,
          item.talkFile,
          { note: null },
          () => {},
        );
        const targetId = exerciseId;
        setExercises((prev) => prev.map((e) => (e.id === targetId ? { ...e, talks: [...e.talks, talk] } : e)));
      }

      updateQueueItem(item.id, { status: 'done', error: null });
    } catch (err: unknown) {
      const message = handleError(err, 'Fallo al comprimir o subir') ?? 'PIN requerido';
      updateQueueItem(item.id, {
        status: 'error',
        error: exerciseId && item.talkFile ? `El ejercicio ya está subido; falló el vídeo hablado: ${message}` : message,
      });
    }
  };

  const enqueue = (item: QueueItem) => {
    updateQueueItem(item.id, { status: 'waiting', error: null });
    uploads.current = uploads.current.then(() => processItem(item));
  };

  const pendingItems = queue.filter((i) => i.status === 'pending' || i.status === 'error');

  const uploadAll = () => {
    const problem = pendingItems.map((i) => ({ i, p: clipFieldsProblem(i) })).find((x) => x.p);
    if (problem) {
      setEditorError(problem.p);
      setEditor({ kind: 'queue', id: problem.i.id });
      return;
    }
    pendingItems.forEach(enqueue);
  };

  const openExercise = (ex: StudioExercise) => {
    const difficulty = Number(ex.difficulty);
    setEditForm({
      title: ex.title,
      type: toClipType(ex.type),
      difficulty: Number.isFinite(difficulty) ? Math.min(10, Math.max(1, Math.round(difficulty))) : 5,
      muscles: getExerciseMuscles(ex.muscles, ex.muscle),
      equipment: ex.equipment ?? 'ninguno',
    });
    setConfirmDelete(false);
    setEditorError(null);
    setEditor({ kind: 'exercise', id: ex.id });
  };

  const closeEditor = () => {
    setEditor(null);
    setEditorError(null);
    setEditForm(null);
    setConfirmDelete(false);
  };

  const uploadFromEditor = (item: QueueItem) => {
    const problem = clipFieldsProblem(item);
    if (problem) {
      setEditorError(problem);
      return;
    }
    setEditorError(null);
    enqueue(item);
    const next = queue.find((q) => q.id !== item.id && q.status === 'pending');
    setEditor(next ? { kind: 'queue', id: next.id } : null);
  };

  const saveExercise = async (id: string) => {
    if (!editForm) return;
    const problem = clipFieldsProblem(editForm);
    if (problem) {
      setEditorError(problem);
      return;
    }
    setSaving(true);
    try {
      const { exercise } = await studioJson<{ exercise: StudioExercise }>(
        `/api/admin/exercises/${encodeURIComponent(id)}`,
        jsonBody('PATCH', editForm),
      );
      setExercises((prev) => prev.map((e) => (e.id === id ? { ...exercise, talks: exercise.talks ?? e.talks } : e)));
      notify({ kind: 'success', text: `«${exercise.title}» guardado.` });
      closeEditor();
    } catch (err: unknown) {
      setEditorError(handleError(err, 'Error al guardar cambios'));
    } finally {
      setSaving(false);
    }
  };

  const deleteExercise = async (id: string) => {
    setDeleting(true);
    try {
      const result = await studioJson<{ talksDeleted?: number; storageRemoved?: boolean }>(
        `/api/admin/exercises/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      setExercises((prev) => prev.filter((e) => e.id !== id));
      notify({
        kind: 'success',
        text: result.storageRemoved === false
          ? 'Vídeo borrado del catálogo; algún archivo no se pudo borrar del almacenamiento.'
          : 'Vídeo borrado.',
      });
      closeEditor();
    } catch (err: unknown) {
      setEditorError(handleError(err, 'Error al eliminar el ejercicio'));
    } finally {
      setDeleting(false);
    }
  };

  const query = searchable(searchQuery.trim());
  const filtered = query
    ? exercises.filter((ex) =>
        [ex.title, ex.type, ex.muscle, ex.equipment, CLIP_TYPE_LABELS[ex.type as ClipType]]
          .some((field) => searchable(field).includes(query)),
      )
    : exercises;

  const editingItem = editor?.kind === 'queue' ? queue.find((q) => q.id === editor.id) ?? null : null;
  const editingExercise = editor?.kind === 'exercise' ? exercises.find((e) => e.id === editor.id) ?? null : null;

  return (
    <div
      className="flex flex-col gap-8"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={VIDEO_ACCEPT}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={talkInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && editingItem) {
            if (isVideoFile(file)) updateQueueItem(editingItem.id, { talkFile: file });
            else setEditorError('El vídeo hablado tiene que ser un archivo de vídeo.');
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Tus vídeos</h1>
          <p className="mt-1 text-[16px] text-ink/55">
            {loading ? 'Cargando…' : `${exercises.length} clips`} · se comprimen en el ordenador del Estudio
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex h-14 items-center gap-2 rounded-full bg-ink pl-5 pr-6 text-lg font-semibold text-white transition-transform active:scale-[0.98] ${FOCUS}`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> Subir vídeos
        </button>
      </div>

      {queue.length > 0 && (
        <section aria-label="Por subir" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Por subir</h2>
            <div className="flex items-center gap-2">
              {queue.some((i) => i.status === 'done') && (
                <button type="button" onClick={() => setQueue((prev) => prev.filter((i) => i.status !== 'done'))} className={`h-9 rounded-full px-3 text-[14px] font-medium text-ink/60 hover:text-ink ${FOCUS}`}>
                  Quitar subidos
                </button>
              )}
              {pendingItems.length > 1 && (
                <button type="button" onClick={uploadAll} className={`flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-white ${FOCUS}`}>
                  Subir todos ({pendingItems.length})
                </button>
              )}
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {queue.map((item) => {
              const busy = ['waiting', 'compressing', 'uploading', 'talk'].includes(item.status);
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 pr-3">
                  <button
                    type="button"
                    disabled={busy || item.status === 'done'}
                    onClick={() => {
                      setEditorError(item.error);
                      setEditor({ kind: 'queue', id: item.id });
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left ${FOCUS}`}
                  >
                    <video src={item.previewUrl} muted playsInline preload="metadata" aria-hidden="true" className="aspect-[9/16] w-11 shrink-0 rounded-lg bg-ink/10 object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold">{item.title || item.file.name}</span>
                      <span className={`mt-0.5 flex items-center gap-1.5 text-[13px] font-medium ${item.status === 'error' ? 'text-heat' : 'text-ink/55'}`}>
                        {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
                        {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        <span className="truncate">
                          {item.status === 'error' && item.error ? item.error : STATUS_LABEL[item.status]}
                          {item.compressedSize !== null && item.status !== 'error' && ` · ${formatBytes(item.compressedSize)}`}
                        </span>
                        {item.talkFile && <Mic className="h-3.5 w-3.5 shrink-0" aria-label="con vídeo hablado" />}
                      </span>
                    </span>
                  </button>
                  {!busy && (
                    <button type="button" onClick={() => removeQueueItem(item.id)} aria-label={`Quitar ${item.file.name}`} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/40 hover:bg-ink/6 hover:text-heat ${FOCUS}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Biblioteca" className="flex flex-col gap-4">
        <label className="relative block">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, tipo o músculo"
            className="h-12 w-full rounded-full bg-ink/6 pl-11 pr-4 text-[16px] placeholder:text-ink/40 focus:outline-2 focus:outline-ink"
          />
        </label>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-ink/55">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando vídeos…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-ink/55">{exercises.length ? 'Nada con ese nombre.' : 'Aún no hay vídeos. Pulsa «Subir vídeos».'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {filtered.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => openExercise(ex)}
                  className={`block w-full overflow-hidden rounded-2xl bg-white text-left shadow-[0_16px_34px_-28px_rgba(0,0,0,0.5)] ${FOCUS}`}
                >
                  <Poster src={ex.poster_url} className="aspect-[4/5] w-full" />
                  <span className="block p-3">
                    <span className="block truncate text-[15px] font-semibold">{ex.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink/55">
                      {CLIP_TYPE_LABELS[ex.type as ClipType] ?? ex.type} · {ex.duration_seconds} s
                      {ex.talks.length > 0 && ` · ${ex.talks.length} hablado${ex.talks.length > 1 ? 's' : ''}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isDragging && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-[32px] border-2 border-dashed border-ink/40 bg-paper/90 text-2xl font-semibold">
          Suelta los vídeos aquí
        </div>
      )}

      <StudioDialog
        open={Boolean(editingItem || (editingExercise && editForm))}
        onClose={closeEditor}
        label="Editar vídeo"
        header={
          <div className="flex items-start gap-4">
            {/* Only here, once a clip is opened, is a video loaded. */}
            <video
              key={editingItem?.previewUrl ?? editingExercise?.id}
              src={editingItem?.previewUrl ?? (editingExercise ? playbackUrl(editingExercise) : undefined)}
              poster={editingExercise?.poster_url ?? undefined}
              autoPlay
              loop
              muted
              playsInline
              className="aspect-[9/16] w-20 shrink-0 rounded-2xl bg-black object-cover sm:w-36"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">{editingItem ? 'Nuevo vídeo' : 'Tu vídeo'}</p>
              <p className="mt-1 break-words text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl">
                {(editingItem ? editingItem.title : editForm?.title) || 'Sin nombre'}
              </p>
              <p className="mt-1 text-[14px] text-ink/55">
                {editingItem
                  ? `${editingItem.file.name} · ${formatBytes(editingItem.originalSize)}`
                  : `${editingExercise?.duration_seconds ?? '—'} s`}
              </p>
            </div>
          </div>
        }
        footer={
          editingItem ? (
            <>
              <button type="button" onClick={() => removeQueueItem(editingItem.id)} className={`h-12 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}>
                Quitar
              </button>
              <button
                type="button"
                onClick={() => uploadFromEditor(editingItem)}
                className={`flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[16px] font-semibold text-white active:scale-[0.98] ${FOCUS}`}
              >
                {queue.some((q) => q.id !== editingItem.id && q.status === 'pending') ? 'Subir y siguiente' : 'Subir'}
              </button>
            </>
          ) : editingExercise ? (
            <>
              {confirmDelete ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void deleteExercise(editingExercise.id)}
                    className={`flex h-12 items-center gap-1.5 rounded-full bg-heat px-4 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                  >
                    {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Borrar para siempre
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={`h-12 rounded-full px-3 text-[15px] font-medium text-ink/60 ${FOCUS}`}>
                    No
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className={`h-12 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}>
                  Borrar
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveExercise(editingExercise.id)}
                className={`flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[16px] font-semibold text-white disabled:opacity-60 active:scale-[0.98] ${FOCUS}`}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar
              </button>
            </>
          ) : null
        }
      >
        {editingItem ? (
          <>
            <ClipForm value={editingItem} onChange={(patch) => updateQueueItem(editingItem.id, patch)} />
            <div className="rounded-2xl border border-dashed border-ink/25 p-4">
              <p className="text-[13px] font-semibold text-ink/60">Vídeo hablado (opcional)</p>
              {editingItem.talkFile ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                    <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{editingItem.talkFile.name}</span>
                    <span className="shrink-0 text-ink/50">{formatBytes(editingItem.talkFile.size)}</span>
                  </span>
                  <button type="button" onClick={() => updateQueueItem(editingItem.id, { talkFile: null })} className={`h-10 shrink-0 rounded-full px-3 text-[14px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}>
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => talkInputRef.current?.click()}
                  className={`mt-2 flex h-11 items-center gap-2 rounded-full bg-ink/6 px-4 text-[15px] font-semibold hover:bg-ink/10 ${FOCUS}`}
                >
                  <Mic className="h-4 w-4" aria-hidden="true" /> Añadir vídeo hablado
                </button>
              )}
              <p className="mt-2 text-[13px] text-ink/50">Tú a cámara, unos 15 s. Conserva la voz y se sube justo después del ejercicio.</p>
            </div>
          </>
        ) : (
          editingExercise &&
          editForm && (
            <>
              <ClipForm value={editForm} onChange={(patch) => setEditForm({ ...editForm, ...patch })} />
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  <Mic className="h-4 w-4 text-ink/50" aria-hidden="true" />
                  {talkCountLabel(editingExercise.talks.length)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const id = editingExercise.id;
                    closeEditor();
                    onManageTalks(id);
                  }}
                  className={`h-10 rounded-full px-4 text-[14px] font-semibold hover:bg-ink/6 ${FOCUS}`}
                >
                  Gestionar
                </button>
              </div>
            </>
          )
        )}

        {editorError && (
          <p role="alert" className="rounded-2xl bg-heat/10 px-4 py-3 text-[15px] font-medium text-heat">
            {editorError}
          </p>
        )}
      </StudioDialog>
    </div>
  );
}

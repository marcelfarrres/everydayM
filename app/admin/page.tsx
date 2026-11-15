'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Ellipsis, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import {
  getExerciseMuscles,
  MuscleSelector,
} from '@/components/workout/MuscleSelector';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import type { Exercise, MuscleSelection } from '@/types/workout';

type ClipType = 'workout' | 'warmup' | 'intro' | 'filler';

type QueueStatus = 'pending' | 'waiting' | 'compressing' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string; // local copy to watch it before uploading
  originalSize: number;
  compressedSize: number | null;
  durationSeconds: number | null;
  isHdr: boolean | null;
  status: QueueStatus;
  error: string | null;
  title: string;
  type: ClipType;
  difficulty: number;
  muscles: MuscleSelection[];
  equipment: string;
}

interface StreamProgressEvent {
  phase: 'compressing' | 'uploading' | 'done' | 'error';
  originalSize?: number;
  compressedSize?: number;
  durationSeconds?: number;
  isHdr?: boolean;
  exercise?: Exercise;
  error?: string;
}

const CLIP_TYPE_LABELS: Record<ClipType, string> = {
  workout: 'Entreno',
  warmup: 'Calentamiento',
  intro: 'Intro',
  filler: 'Relleno',
};
const EQUIPMENT: Record<string, string> = {
  ninguno: 'Sin material',
  mancuernas: 'Mancuernas',
  bandas: 'Bandas elásticas',
  esterilla: 'Esterilla',
};
const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: 'Sin subir',
  waiting: 'En cola',
  compressing: 'Comprimiendo',
  uploading: 'Subiendo',
  done: 'Subido',
  error: 'Error',
};
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

type ClipFields = { title: string; type: ClipType; difficulty: number; muscles: MuscleSelection[]; equipment: string };

/** Title, type, difficulty, muscles and equipment: the same form for a new clip and a saved one. */
function ClipForm({ value, onChange }: { value: ClipFields; onChange: (patch: Partial<ClipFields>) => void }) {
  const field = `h-12 w-full rounded-2xl bg-white px-4 text-[16px] font-medium focus:outline-2 focus:outline-ink`;
  return (
    <div className="flex flex-col gap-5">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Nombre del ejercicio</span>
        <input type="text" value={value.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Ej. Flexiones diamante" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Tipo</span>
          <select value={value.type} onChange={(e) => onChange({ type: e.target.value as ClipType })} className={field}>
            {(Object.keys(CLIP_TYPE_LABELS) as ClipType[]).map((t) => (
              <option key={t} value={t}>{CLIP_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Material</span>
          <select value={value.equipment} onChange={(e) => onChange({ equipment: e.target.value })} className={field}>
            {Object.entries(EQUIPMENT).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <DifficultyScale value={value.difficulty} onChange={(difficulty) => onChange({ difficulty })} />
      {value.type === 'workout' && <MuscleSelector value={value.muscles} onChange={(muscles) => onChange({ muscles })} />}
    </div>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return '—';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function defaultTitleFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').trim();
}

export default function AdminStudioPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    type: ClipType;
    difficulty: number;
    muscles: MuscleSelection[];
    equipment: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The clip open in the editor: one not uploaded yet, or one from the library.
  const [editor, setEditor] = useState<{ kind: 'queue' | 'exercise'; id: string } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDialogElement | null>(null);
  // uploads run one after another, whatever order they are asked in
  const uploads = useRef<Promise<unknown>>(Promise.resolve());

  const isLanSession = useSyncExternalStore(
    () => () => {},
    () => {
      const host = window.location.hostname.toLowerCase();
      return (
        host !== 'localhost' &&
        host !== '127.0.0.1' &&
        host !== '::1' &&
        host !== '[::1]'
      );
    },
    () => false,
  );

  const handleLanLogout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => {});
    router.replace('/studio-login');
  };

  const fetchExercises = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/exercises');
      if (res.status === 401) {
        router.replace('/studio-login');
        return;
      }
      const data = (await res.json()) as {
        exercises?: Exercise[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'No se pudieron cargar los ejercicios');
      }
      setExercises(data.exercises ?? []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al cargar la biblioteca';
      setBannerMessage({ kind: 'error', text: msg });
    } finally {
      setLoadingExercises(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/exercises')
      .then(async (res) => {
        if (res.status === 401) {
          router.replace('/studio-login');
          return;
        }
        const data = (await res.json()) as {
          exercises?: Exercise[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? 'No se pudieron cargar los ejercicios');
        }
        if (!cancelled) {
          setExercises(data.exercises ?? []);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Error al cargar la biblioteca';
          setBannerMessage({ kind: 'error', text: msg });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExercises(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const addFilesToQueue = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith('video/') ||
        /\.(mov|mp4|m4v|webm)$/i.test(f.name),
    );

    if (incoming.length === 0) {
      setBannerMessage({
        kind: 'error',
        text: 'Selecciona archivos de vídeo válidos (.MOV o .MP4).',
      });
      return;
    }

    const newItems: QueueItem[] = incoming.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      compressedSize: null,
      durationSeconds: null,
      isHdr: null,
      status: 'pending',
      error: null,
      title: defaultTitleFromFilename(file.name),
      type: 'workout',
      difficulty: 5,
      muscles: [],
      equipment: 'ninguno',
    }));

    setQueue((prev) => {
      const next = [...prev, ...newItems];
      return next;
    });
    setSelectedQueueId((prev) => prev ?? newItems[0]?.id ?? null);
    setBannerMessage(null);
    // straight to the first new clip: watch it and fill it in
    if (newItems[0]) setEditor({ kind: 'queue', id: newItems[0].id });
  }, []);

  const updateQueueItem = useCallback(
    (id: string, patch: Partial<QueueItem>) => {
      setQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const removeQueueItem = (id: string) => {
    const gone = queue.find((item) => item.id === id);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    if (editor?.kind === 'queue' && editor.id === id) setEditor(null);
    setQueue((prev) => {
      const remaining = prev.filter((item) => item.id !== id);
      if (selectedQueueId === id) {
        setSelectedQueueId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const validateItemMetadata = (item: QueueItem): string | null => {
    if (!item.title.trim()) {
      return `El archivo "${item.file.name}" necesita un título.`;
    }
    if (
      item.type === 'workout' &&
      !item.muscles.some((m) => m.role === 'primary')
    ) {
      return `Marca al menos un músculo principal en «${item.title || item.file.name}» (toca dos veces una zona).`;
    }
    return null;
  };

  const processSingleQueueItem = async (item: QueueItem): Promise<boolean> => {
    const validationError = validateItemMetadata(item);
    if (validationError) {
      updateQueueItem(item.id, { status: 'error', error: validationError });
      setSelectedQueueId(item.id);
      setBannerMessage({ kind: 'error', text: validationError });
      return false;
    }

    updateQueueItem(item.id, {
      status: 'compressing',
      error: null,
    });

    try {
      const metadataPayload = {
        title: item.title.trim(),
        type: item.type,
        difficulty: item.difficulty,
        muscles: item.type === 'workout' ? item.muscles : [],
        equipment: item.equipment,
      };

      const response = await fetch('/api/admin/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-studio-metadata': encodeURIComponent(
            JSON.stringify(metadataPayload),
          ),
          'x-studio-stream': '1',
        },
        body: item.file,
      });

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          router.replace('/studio-login');
          return false;
        }
        const errData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errData.error ?? `Error HTTP ${response.status} al procesar el clip`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let succeeded = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const evt = JSON.parse(trimmed) as StreamProgressEvent;

          if (evt.phase === 'compressing') {
            updateQueueItem(item.id, {
              status: 'compressing',
              originalSize: evt.originalSize ?? item.originalSize,
            });
          } else if (evt.phase === 'uploading') {
            updateQueueItem(item.id, {
              status: 'uploading',
              originalSize: evt.originalSize ?? item.originalSize,
              compressedSize: evt.compressedSize ?? null,
              durationSeconds: evt.durationSeconds ?? null,
              isHdr: evt.isHdr ?? null,
            });
          } else if (evt.phase === 'done') {
            updateQueueItem(item.id, {
              status: 'done',
              originalSize: evt.originalSize ?? item.originalSize,
              compressedSize: evt.compressedSize ?? null,
              durationSeconds: evt.durationSeconds ?? null,
              isHdr: evt.isHdr ?? null,
              error: null,
            });
            if (evt.exercise) {
              setExercises((prev) => [evt.exercise!, ...prev]);
            }
            succeeded = true;
          } else if (evt.phase === 'error') {
            throw new Error(evt.error ?? 'Error durante la ingesta del clip');
          }
        }
      }

      return succeeded;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Fallo al comprimir o subir';
      updateQueueItem(item.id, {
        status: 'error',
        error: message,
      });
      return false;
    }
  };

  const handleProcessBatch = async () => {
    const pendingItems = queue.filter(
      (item) => item.status === 'pending' || item.status === 'error',
    );
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      const validationErr = validateItemMetadata(item);
      if (validationErr) {
        setSelectedQueueId(item.id);
        setBannerMessage({ kind: 'error', text: validationErr });
        return;
      }
    }

    setBatchRunning(true);
    setBannerMessage(null);

    let okCount = 0;
    for (const item of pendingItems) {
      setSelectedQueueId(item.id);
      const ok = await processSingleQueueItem(item);
      if (ok) okCount += 1;
    }

    setBatchRunning(false);
    if (okCount === pendingItems.length) {
      setBannerMessage({
        kind: 'success',
        text: `¡Lote completado! ${okCount} clip(s) comprimidos y subidos correctamente.`,
      });
    } else {
      setBannerMessage({
        kind: 'error',
        text: `Se completaron ${okCount} de ${pendingItems.length} clips. Revisa los elementos marcados con error.`,
      });
    }
  };

  const handleRecalculateDurations = async () => {
    setRecalculating(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/admin/recalculate-durations', {
        method: 'POST',
      });
      if (res.status === 401) {
        router.replace('/studio-login');
        return;
      }
      const data = (await res.json()) as {
        total?: number;
        updated?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'Error al recalcular duraciones');
      }
      setBannerMessage({
        kind: 'success',
        text: `Duraciones verificadas con ffprobe: ${data.updated ?? 0} actualizadas de ${data.total ?? 0} clips (${data.failed ?? 0} errores).`,
      });
      await fetchExercises();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al recalcular duraciones';
      setBannerMessage({ kind: 'error', text: msg });
    } finally {
      setRecalculating(false);
    }
  };

  const startEditingExercise = (ex: Exercise) => {
    const normalizedType: ClipType =
      ex.type === 'warmup' ||
      ex.type === 'intro' ||
      ex.type === 'filler' ||
      ex.type === 'workout'
        ? ex.type
        : 'workout';

    const numericDifficulty = Number(ex.difficulty);
    setEditingId(ex.id);
    setEditForm({
      title: ex.title,
      type: normalizedType,
      difficulty: Number.isFinite(numericDifficulty)
        ? Math.min(10, Math.max(1, Math.round(numericDifficulty)))
        : 5,
      muscles: getExerciseMuscles(ex.muscles, ex.muscle),
      equipment: ex.equipment ?? 'ninguno',
    });
  };

  const handleSaveEdit = async (id: string): Promise<boolean> => {
    if (!editForm) return false;
    if (
      editForm.type === 'workout' &&
      !editForm.muscles.some((m) => m.role === 'primary')
    ) {
      setBannerMessage({
        kind: 'error',
        text: 'Marca al menos un músculo principal (toca dos veces una zona).',
      });
      return false;
    }

    setSavingEdit(true);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.status === 401) {
        router.replace('/studio-login');
        return false;
      }
      const data = (await res.json()) as {
        exercise?: Exercise;
        error?: string;
      };
      if (!res.ok || !data.exercise) {
        throw new Error(data.error ?? 'No se pudo actualizar el ejercicio');
      }

      setExercises((prev) =>
        prev.map((item) => (item.id === id ? data.exercise! : item)),
      );
      setEditingId(null);
      setEditForm(null);
      setBannerMessage({
        kind: 'success',
        text: `«${data.exercise.title}» guardado.`,
      });
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al guardar cambios';
      setBannerMessage({ kind: 'error', text: msg });
      return false;
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteExercise = async (id: string): Promise<boolean> => {
    setDeletingId(id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 401) {
        router.replace('/studio-login');
        return false;
      }
      const data = (await res.json()) as {
        deleted?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? 'No se pudo eliminar el ejercicio');
      }

      setExercises((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
      setBannerMessage({
        kind: 'success',
        text: 'Vídeo borrado.',
      });
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al eliminar el ejercicio';
      setBannerMessage({ kind: 'error', text: msg });
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  // The editor is a native <dialog>: open it whenever a clip is chosen.
  useEffect(() => {
    const dialog = editorRef.current;
    if (!dialog) return;
    if (editor && !dialog.open) dialog.showModal();
    if (!editor && dialog.open) dialog.close();
  }, [editor]);

  const openExercise = (ex: Exercise) => {
    startEditingExercise(ex);
    setConfirmDeleteId(null);
    setEditorError(null);
    setEditor({ kind: 'exercise', id: ex.id });
  };

  const editingQueueItem = editor?.kind === 'queue' ? queue.find((q) => q.id === editor.id) ?? null : null;
  const editingExercise = editor?.kind === 'exercise' ? exercises.find((e) => e.id === editor.id) ?? null : null;
  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'error').length;

  /** Upload this clip (after the ones already going) and move on to the next one still to fill in. */
  const uploadFromEditor = (item: QueueItem) => {
    const problem = validateItemMetadata(item);
    if (problem) {
      setEditorError(problem);
      return;
    }
    setEditorError(null);
    updateQueueItem(item.id, { status: 'waiting', error: null });
    uploads.current = uploads.current.then(() => processSingleQueueItem(item));
    const next = queue.find((q) => q.id !== item.id && q.status === 'pending');
    setEditor(next ? { kind: 'queue', id: next.id } : null);
  };

  const saveFromEditor = async (id: string) => {
    if (await handleSaveEdit(id)) setEditor(null);
  };

  const filteredExercises = exercises.filter((ex) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ex.title.toLowerCase().includes(q) ||
      ex.type.toLowerCase().includes(q) ||
      (ex.muscle ?? '').toLowerCase().includes(q) ||
      (ex.equipment ?? '').toLowerCase().includes(q)
    );
  });

  const banner = bannerMessage && (
    <div
      role={bannerMessage.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-2xl p-4 text-[15px] font-medium ${
        bannerMessage.kind === 'error' ? 'bg-heat/10 text-heat' : 'bg-white text-ink'
      }`}
    >
      <span className="flex items-start gap-2.5">
        {bannerMessage.kind === 'error' ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" />
        )}
        {bannerMessage.text}
      </span>
      <button type="button" onClick={() => setBannerMessage(null)} aria-label="Cerrar mensaje" className={`shrink-0 rounded-full p-1 opacity-60 hover:opacity-100 ${FOCUS}`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <main
      className="min-h-dvh bg-paper font-[family-name:var(--font-display)] text-ink"
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
        if (e.dataTransfer.files?.length) addFilesToQueue(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/quicktime,video/mp4,video/*,.mov,.mp4"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFilesToQueue(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className={`flex h-11 items-center gap-1.5 rounded-full bg-ink/6 pl-3 pr-4 text-[15px] font-semibold hover:bg-ink/10 ${FOCUS}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> App
          </Link>
          <details className="relative">
            <summary aria-label="Más opciones" className={`flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-ink/6 hover:bg-ink/10 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl bg-white p-1.5 text-[15px] font-medium shadow-[0_24px_60px_-18px_rgba(0,0,0,0.35)]">
              <button
                type="button"
                onClick={() => void handleRecalculateDurations()}
                disabled={recalculating}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left hover:bg-ink/6 disabled:opacity-50 ${FOCUS}`}
              >
                {recalculating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {recalculating ? 'Recalculando…' : 'Recalcular duraciones'}
              </button>
              {isLanSession && (
                <button type="button" onClick={() => void handleLanLogout()} className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-ink/6 ${FOCUS}`}>
                  Cerrar sesión
                </button>
              )}
            </div>
          </details>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Tus vídeos</h1>
            <p className="mt-1 text-[16px] text-ink/55">
              {loadingExercises ? 'Cargando…' : `${exercises.length} clips`} · se comprimen en el ordenador del Estudio
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

        {banner}

        {/* STILL TO UPLOAD */}
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
                {pendingCount > 1 && (
                  <button
                    type="button"
                    disabled={batchRunning}
                    onClick={() => void handleProcessBatch()}
                    className={`flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-50 ${FOCUS}`}
                  >
                    {batchRunning && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Subir todos ({pendingCount})
                  </button>
                )}
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {queue.map((item) => {
                const busy = item.status === 'waiting' || item.status === 'compressing' || item.status === 'uploading';
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
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          {item.status === 'error' && item.error ? item.error : STATUS_LABEL[item.status]}
                          {item.compressedSize !== null && item.status !== 'error' && ` · ${formatBytes(item.compressedSize)}`}
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

        {/* THE LIBRARY */}
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

          {loadingExercises ? (
            <p className="flex items-center justify-center gap-2 py-16 text-ink/55">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando vídeos…
            </p>
          ) : filteredExercises.length === 0 ? (
            <p className="py-16 text-center text-ink/55">{exercises.length ? 'Nada con ese nombre.' : 'Aún no hay vídeos. Pulsa «Subir vídeos».'}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {filteredExercises.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => openExercise(ex)}
                    onMouseEnter={(e) => void e.currentTarget.querySelector('video')?.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.querySelector('video')?.pause()}
                    className={`group block w-full overflow-hidden rounded-2xl bg-white text-left shadow-[0_16px_34px_-28px_rgba(0,0,0,0.5)] ${FOCUS}`}
                  >
                    <video
                      src={`${ex.video_url}#t=0.5`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-hidden="true"
                      className="aspect-[4/5] w-full bg-ink/10 object-cover"
                    />
                    <span className="block p-3">
                      <span className="block truncate text-[15px] font-semibold">{ex.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink/55">
                        {CLIP_TYPE_LABELS[ex.type as ClipType] ?? ex.type} · {ex.duration_seconds} s
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* drop anywhere on a computer */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-[32px] border-2 border-dashed border-ink/40 bg-paper/90 text-2xl font-semibold">
          Suelta los vídeos aquí
        </div>
      )}

      {/* THE EDITOR: the clip playing small, and its details */}
      <dialog
        ref={editorRef}
        onClose={() => {
          setEditor(null);
          setEditorError(null);
          setEditingId(null);
          setEditForm(null);
        }}
        aria-label="Editar vídeo"
        className="m-auto max-h-[94dvh] w-[min(96vw,44rem)] overflow-y-auto rounded-[32px] bg-paper p-0 font-[family-name:var(--font-display)] text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        {(editingQueueItem || (editingExercise && editForm)) && (
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <video
                key={editingQueueItem?.previewUrl ?? editingExercise?.video_url}
                src={editingQueueItem?.previewUrl ?? editingExercise?.video_url}
                autoPlay
                loop
                muted
                playsInline
                className="aspect-[9/16] w-28 shrink-0 rounded-2xl bg-black object-cover sm:w-36"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">{editingQueueItem ? 'Nuevo vídeo' : 'Tu vídeo'}</p>
                <p className="mt-1 break-words text-2xl font-semibold leading-tight tracking-[-0.02em]">
                  {(editingQueueItem ? editingQueueItem.title : editForm?.title) || 'Sin nombre'}
                </p>
                <p className="mt-1 text-[14px] text-ink/55">
                  {editingQueueItem
                    ? `${editingQueueItem.file.name} · ${formatBytes(editingQueueItem.originalSize)}`
                    : `${editingExercise?.duration_seconds ?? '—'} s`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditor(null)}
                aria-label="Cerrar"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/8 hover:bg-ink/15 ${FOCUS}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {editingQueueItem ? (
              <ClipForm value={editingQueueItem} onChange={(patch) => updateQueueItem(editingQueueItem.id, patch)} />
            ) : (
              editForm && <ClipForm value={editForm} onChange={(patch) => setEditForm({ ...editForm, ...patch })} />
            )}

            {(editorError || (editor && bannerMessage?.kind === 'error')) && (
              <p role="alert" className="rounded-2xl bg-heat/10 px-4 py-3 text-[15px] font-medium text-heat">
                {editorError ?? bannerMessage?.text}
              </p>
            )}

            <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 bg-paper/95 p-5 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
              {editingQueueItem ? (
                <>
                  <button type="button" onClick={() => removeQueueItem(editingQueueItem.id)} className={`h-12 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}>
                    Quitar
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadFromEditor(editingQueueItem)}
                    className={`flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[16px] font-semibold text-white active:scale-[0.98] ${FOCUS}`}
                  >
                    {queue.some((q) => q.id !== editingQueueItem.id && q.status === 'pending') ? 'Subir y siguiente' : 'Subir'}
                  </button>
                </>
              ) : editingExercise ? (
                <>
                  {confirmDeleteId === editingExercise.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={deletingId === editingExercise.id}
                        onClick={async () => {
                          if (await handleDeleteExercise(editingExercise.id)) setEditor(null);
                        }}
                        className={`flex h-12 items-center gap-1.5 rounded-full bg-heat px-4 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                      >
                        {deletingId === editingExercise.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Borrar para siempre
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className={`h-12 rounded-full px-3 text-[15px] font-medium text-ink/60 ${FOCUS}`}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(editingExercise.id)} className={`h-12 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}>
                      Borrar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => void saveFromEditor(editingExercise.id)}
                    className={`flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[16px] font-semibold text-white disabled:opacity-60 active:scale-[0.98] ${FOCUS}`}
                  >
                    {savingEdit && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Guardar
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </dialog>
    </main>
  );
}

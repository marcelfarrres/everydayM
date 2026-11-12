'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  CheckCircle2,
  Loader2,
  Trash2,
  Pencil,
  RefreshCw,
  Film,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Save,
  X,
  Play,
  HardDriveDownload,
  LogOut,
  Smartphone,
} from 'lucide-react';
import {
  getExerciseMuscles,
  MuscleSelector,
} from '@/components/workout/MuscleSelector';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import type { Exercise, MuscleSelection } from '@/types/workout';

type ClipType = 'workout' | 'warmup' | 'intro' | 'filler';

type QueueStatus = 'pending' | 'compressing' | 'uploading' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
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
  workout: 'Rutina Principal (Entreno)',
  warmup: 'Calentamiento',
  intro: 'Intro (Vídeo inicial)',
  filler: 'Relleno / fondo',
};

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

  const [editingId, setEditingId] = useState<string | null>(null);
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

  const refreshExercises = useCallback(async () => {
    setLoadingExercises(true);
    await fetchExercises();
  }, [fetchExercises]);

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
      return `Marca al menos un músculo principal para "${item.title || item.file.name}".`;
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

  const handleSaveEdit = async (id: string) => {
    if (!editForm) return;
    if (
      editForm.type === 'workout' &&
      !editForm.muscles.some((m) => m.role === 'primary')
    ) {
      setBannerMessage({
        kind: 'error',
        text: 'Debes seleccionar al menos un músculo principal para un ejercicio de entreno.',
      });
      return;
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
        return;
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
        text: `Ejercicio "${data.exercise.title}" actualizado.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al guardar cambios';
      setBannerMessage({ kind: 'error', text: msg });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteExercise = async (id: string) => {
    setDeletingId(id);
    setBannerMessage(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 401) {
        router.replace('/studio-login');
        return;
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
        text: 'Ejercicio y archivo de vídeo eliminados de Supabase.',
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al eliminar el ejercicio';
      setBannerMessage({ kind: 'error', text: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const selectedItem =
    queue.find((item) => item.id === selectedQueueId) ?? queue[0] ?? null;

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

  return (
    <div className="min-h-screen bg-[#080b09] bg-neon-grid text-white p-4 md:p-8 font-sans selection:bg-[#4ade80] selection:text-black">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center -z-10">
        <div className="w-[650px] h-[650px] bg-gradient-to-tr from-[#166534]/30 via-[#22c55e]/20 to-[#4ade80]/10 rounded-full blur-[160px] opacity-75" />
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Cabecera */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel border border-[#22c55e]/30 p-6 rounded-3xl backdrop-blur-2xl">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#4ade80] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> EverydayM Studio · Local
              </span>
              <Link
                href="/"
                className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 hover:text-white flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3 h-3 text-[#4ade80]" /> Ir al Reproductor
              </Link>
              <Link
                href="/?rec=1"
                className="text-[10px] font-bold uppercase tracking-wider rounded-full border border-[#22c55e]/35 bg-[#22c55e]/10 px-2.5 py-0.5 text-[#4ade80] hover:bg-[#22c55e] hover:text-black transition-colors"
              >
                Modo Creador TikTok 9:16
              </Link>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase italic mt-1">
              Estudio de Ingesta & Biblioteca
            </h1>
            <p className="text-xs text-neutral-300 mt-1">
              Compresión local H.264 (1080p, HDR→SDR, CRF 24, faststart), exportación de resumen TikTok MP4 y subida segura con Service Role.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isLanSession && (
              <>
                <span className="px-3 py-2 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[11px] font-black uppercase tracking-wider text-[#4ade80] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> WiFi móvil
                </span>
                <button
                  type="button"
                  onClick={handleLanLogout}
                  className="px-3.5 py-3 rounded-2xl bg-[#141b16] hover:bg-red-500/15 border border-white/15 hover:border-red-500/40 text-xs font-black uppercase tracking-wider text-neutral-300 hover:text-red-300 flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleRecalculateDurations}
              disabled={recalculating}
              className="px-4 py-3 rounded-2xl bg-[#141b16] hover:bg-[#1b251d] border border-[#22c55e]/30 text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`}
              />
              {recalculating
                ? 'Recalculando con ffprobe...'
                : 'Recalcular duraciones'}
            </button>
          </div>
        </header>

        {bannerMessage && (
          <div
            className={`p-4 rounded-2xl text-sm font-bold flex items-center justify-between gap-3 border ${
              bannerMessage.kind === 'error'
                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                : 'bg-[#22c55e]/15 text-[#4ade80] border-[#22c55e]/30'
            }`}
          >
            <div className="flex items-center gap-3">
              {bannerMessage.kind === 'error' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#4ade80]" />
              )}
              <span>{bannerMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-neutral-400 hover:text-white p-1"
              aria-label="Cerrar mensaje"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bloque 1: Subida por lotes y editor de metadatos */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna izquierda: Drag & Drop + Cola de archivos */}
          <div className="lg:col-span-5 bg-[#101411]/95 border border-[#22c55e]/25 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white">
                  1. Cola de Subida por Lotes
                </h2>
                <p className="text-xs text-neutral-400">
                  Arrastra varios archivos .MOV o .MP4 del iPhone o cámara.
                </p>
              </div>
              {queue.some((i) => i.status === 'done') && (
                <button
                  type="button"
                  onClick={() =>
                    setQueue((prev) => prev.filter((i) => i.status !== 'done'))
                  }
                  className="text-[10px] font-black uppercase tracking-wider text-neutral-400 hover:text-white"
                >
                  Limpiar completados
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  addFilesToQueue(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#4ade80] bg-[#22c55e]/15'
                  : 'border-[#22c55e]/30 bg-[#141b16]/70 hover:border-[#4ade80]/60 hover:bg-[#141b16]'
              }`}
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
              <Upload className="w-8 h-8 text-[#4ade80] mx-auto mb-2" />
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Arrastra tus vídeos aquí o haz clic para elegir
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">
                Soporta lotes de .MOV (HEVC/HDR) y .MP4 · Límite de salida &lt; 50 MB
              </p>
            </div>

            {queue.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                  {queue.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    const savingsPct =
                      item.compressedSize && item.originalSize > 0
                        ? Math.round(
                            (1 - item.compressedSize / item.originalSize) * 100,
                          )
                        : null;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedQueueId(item.id)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#141b16] border-[#4ade80]'
                            : 'bg-[#0c100d] border-white/10 hover:border-[#22c55e]/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {item.title || item.file.name}
                            </p>
                            <p className="text-[11px] text-neutral-400 truncate">
                              {item.file.name} · {CLIP_TYPE_LABELS[item.type]}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {item.status === 'pending' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-neutral-800 text-neutral-300">
                                Pendiente
                              </span>
                            )}
                            {item.status === 'compressing' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Comprimiendo
                              </span>
                            )}
                            {item.status === 'uploading' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Subiendo
                              </span>
                            )}
                            {item.status === 'done' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#22c55e]/20 text-[#4ade80]">
                                ✅ Subido
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/20 text-red-300">
                                Error
                              </span>
                            )}

                            {item.status !== 'compressing' &&
                              item.status !== 'uploading' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeQueueItem(item.id);
                                  }}
                                  className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                                  aria-label={`Quitar ${item.file.name} de la cola`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-300">
                          <span className="inline-flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-md">
                            <HardDriveDownload className="w-3 h-3 text-[#4ade80]" />
                            {formatBytes(item.originalSize)}
                            {item.compressedSize !== null && (
                              <>
                                {' → '}
                                <span className="text-[#4ade80] font-black">
                                  {formatBytes(item.compressedSize)}
                                </span>
                                {savingsPct !== null && savingsPct > 0 && (
                                  <span className="text-[#4ade80]">
                                    (-{savingsPct}%)
                                  </span>
                                )}
                              </>
                            )}
                          </span>

                          {item.durationSeconds !== null && (
                            <span className="bg-black/40 px-2 py-0.5 rounded-md text-neutral-300">
                              ⏱ {item.durationSeconds}s
                            </span>
                          )}

                          {item.isHdr && (
                            <span className="bg-[#22c55e]/15 text-[#4ade80] px-2 py-0.5 rounded-md font-bold">
                              HDR→SDR
                            </span>
                          )}
                        </div>

                        {item.error && (
                          <p className="mt-1.5 text-[11px] font-semibold text-red-400">
                            {item.error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={
                    batchRunning ||
                    !queue.some(
                      (i) => i.status === 'pending' || i.status === 'error',
                    )
                  }
                  onClick={handleProcessBatch}
                  className="w-full bg-[#22c55e] hover:bg-[#4ade80] text-black font-black uppercase tracking-wider py-3.5 rounded-2xl transition-all shadow-[0_10px_30px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {batchRunning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Procesando cola...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Comprimir y Subir Cola (
                      {
                        queue.filter(
                          (i) => i.status === 'pending' || i.status === 'error',
                        ).length
                      }
                      )
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 text-center py-4">
                No hay vídeos en la cola. Añade uno o varios clips para configurar sus metadatos.
              </p>
            )}
          </div>

          {/* Columna derecha: Formulario de metadatos del archivo seleccionado */}
          <div className="lg:col-span-7 bg-[#101411]/95 border border-[#22c55e]/25 rounded-3xl p-6 shadow-2xl">
            {selectedItem ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4ade80]">
                      Metadatos del clip seleccionado
                    </span>
                    <h3 className="text-xl font-black text-white truncate">
                      {selectedItem.file.name} (
                      {formatBytes(selectedItem.originalSize)})
                    </h3>
                  </div>

                  {(selectedItem.status === 'pending' ||
                    selectedItem.status === 'error') && (
                    <button
                      type="button"
                      disabled={batchRunning}
                      onClick={() => void processSingleQueueItem(selectedItem)}
                      className="px-4 py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#4ade80] text-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      Subir este clip
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">
                      Título del ejercicio
                    </label>
                    <input
                      type="text"
                      value={selectedItem.title}
                      onChange={(e) =>
                        updateQueueItem(selectedItem.id, {
                          title: e.target.value,
                        })
                      }
                      placeholder="Ej. Flexiones diamante"
                      className="w-full bg-[#141b16] border border-white/15 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white placeholder-neutral-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">
                      Tipo de Clip
                    </label>
                    <select
                      value={selectedItem.type}
                      onChange={(e) =>
                        updateQueueItem(selectedItem.id, {
                          type: e.target.value as ClipType,
                        })
                      }
                      className="w-full bg-[#141b16] border border-white/15 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white"
                    >
                      <option value="workout">Rutina Principal (Entreno)</option>
                      <option value="warmup">Calentamiento</option>
                      <option value="intro">Intro (Vídeo inicial)</option>
                      <option value="filler">Relleno / fondo</option>
                    </select>
                  </div>
                </div>

                <DifficultyScale
                  value={selectedItem.difficulty}
                  onChange={(difficulty) =>
                    updateQueueItem(selectedItem.id, { difficulty })
                  }
                />

                {selectedItem.type === 'workout' && (
                  <MuscleSelector
                    value={selectedItem.muscles}
                    onChange={(muscles) =>
                      updateQueueItem(selectedItem.id, { muscles })
                    }
                  />
                )}

                <div>
                  <label className="block text-[10px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">
                    Equipamiento
                  </label>
                  <select
                    value={selectedItem.equipment}
                    onChange={(e) =>
                      updateQueueItem(selectedItem.id, {
                        equipment: e.target.value,
                      })
                    }
                    className="w-full bg-[#141b16] border border-white/15 rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-[#4ade80] transition-colors text-white"
                  >
                    <option value="ninguno">Ninguno (Peso corporal)</option>
                    <option value="mancuernas">Mancuernas</option>
                    <option value="bandas">Bandas elásticas</option>
                    <option value="esterilla">Esterilla</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                <Film className="w-12 h-12 text-[#22c55e]/40 mb-3" />
                <p className="text-sm font-bold text-neutral-300">
                  Selecciona o arrastra vídeos a la cola
                </p>
                <p className="text-xs text-neutral-500 max-w-sm mt-1">
                  Podrás configurar el título, tipo (entreno, calentamiento, intro o relleno/fondo), dificultad, mapa muscular y equipamiento de cada clip antes de subirlo.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Bloque 2: Biblioteca de ejercicios existentes */}
        <section className="bg-[#101411]/95 border border-[#22c55e]/25 rounded-3xl p-6 space-y-5 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">
                2. Biblioteca de Ejercicios ({exercises.length})
              </h2>
              <p className="text-xs text-neutral-400">
                Edita los metadatos o elimina clips existentes (borra tanto la fila como el archivo en Supabase Storage).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título, tipo o músculo..."
                className="bg-[#141b16] border border-white/15 rounded-xl px-4 py-2.5 text-xs font-semibold text-white placeholder-neutral-500 focus:outline-none focus:border-[#4ade80] w-64"
              />
              <button
                type="button"
                onClick={() => void refreshExercises()}
                disabled={loadingExercises}
                className="p-2.5 rounded-xl bg-[#141b16] border border-white/15 text-neutral-300 hover:text-white hover:border-[#4ade80]"
                aria-label="Recargar lista de ejercicios"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingExercises ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {loadingExercises ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-neutral-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#4ade80]" />
              Cargando ejercicios...
            </div>
          ) : filteredExercises.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              No se encontraron ejercicios.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredExercises.map((ex) => {
                const isEditing = editingId === ex.id && editForm !== null;
                const isConfirmingDelete = confirmDeleteId === ex.id;
                const exMuscles = getExerciseMuscles(ex.muscles, ex.muscle);
                const typeLabel =
                  CLIP_TYPE_LABELS[ex.type as ClipType] ?? ex.type;

                return (
                  <div
                    key={ex.id}
                    className="rounded-2xl border border-white/10 bg-[#141b16]/90 p-4 transition-colors"
                  >
                    {!isEditing ? (
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-white">
                              {ex.title}
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30">
                              {typeLabel}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/40 text-neutral-300">
                              Dificultad {ex.difficulty}/10
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/40 text-neutral-300">
                              ⏱ {ex.duration_seconds}s
                            </span>
                            {ex.equipment && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/40 text-neutral-400 uppercase">
                                {ex.equipment}
                              </span>
                            )}
                          </div>

                          {exMuscles.length > 0 && (
                            <p className="text-xs text-neutral-400">
                              Músculos:{' '}
                              {exMuscles
                                .map(
                                  (m) =>
                                    `${m.id}${m.role === 'primary' ? ' (principal)' : ''}`,
                                )
                                .join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                          {ex.video_url && (
                            <a
                              href={ex.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 rounded-xl bg-black/40 hover:bg-black/70 border border-white/10 text-xs font-bold text-neutral-300 hover:text-white flex items-center gap-1.5"
                            >
                              <Play className="w-3.5 h-3.5 text-[#4ade80]" />
                              Ver clip
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => startEditingExercise(ex)}
                            className="px-3 py-2 rounded-xl bg-black/40 hover:bg-[#1b251d] border border-white/10 hover:border-[#4ade80]/40 text-xs font-bold text-neutral-200 flex items-center gap-1.5"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#4ade80]" />
                            Editar
                          </button>

                          {!isConfirmingDelete ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ex.id)}
                              className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs font-bold text-red-300 flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Borrar
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === ex.id}
                                onClick={() => void handleDeleteExercise(ex.id)}
                                className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-black text-xs font-black uppercase flex items-center gap-1"
                              >
                                {deletingId === ex.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-2 rounded-xl bg-neutral-800 text-xs font-bold text-neutral-300 hover:text-white"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <span className="text-xs font-black uppercase tracking-wider text-[#4ade80]">
                            Editando ejercicio
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1"
                          >
                            <X className="w-4 h-4" /> Cancelar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-neutral-400 mb-1.5 uppercase tracking-[0.15em]">
                              Título
                            </label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  title: e.target.value,
                                })
                              }
                              className="w-full bg-[#0c100d] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-[#4ade80]"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-neutral-400 mb-1.5 uppercase tracking-[0.15em]">
                              Tipo de Clip
                            </label>
                            <select
                              value={editForm.type}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  type: e.target.value as ClipType,
                                })
                              }
                              className="w-full bg-[#0c100d] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-[#4ade80]"
                            >
                              <option value="workout">
                                Rutina Principal (Entreno)
                              </option>
                              <option value="warmup">Calentamiento</option>
                              <option value="intro">
                                Intro (Vídeo inicial)
                              </option>
                              <option value="filler">Relleno / fondo</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-neutral-400 mb-1.5 uppercase tracking-[0.15em]">
                              Equipamiento
                            </label>
                            <select
                              value={editForm.equipment}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  equipment: e.target.value,
                                })
                              }
                              className="w-full bg-[#0c100d] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-[#4ade80]"
                            >
                              <option value="ninguno">
                                Ninguno (Peso corporal)
                              </option>
                              <option value="mancuernas">Mancuernas</option>
                              <option value="bandas">Bandas elásticas</option>
                              <option value="esterilla">Esterilla</option>
                            </select>
                          </div>
                        </div>

                        <DifficultyScale
                          value={editForm.difficulty}
                          onChange={(difficulty) =>
                            setEditForm({ ...editForm, difficulty })
                          }
                        />

                        {editForm.type === 'workout' && (
                          <MuscleSelector
                            value={editForm.muscles}
                            onChange={(muscles) =>
                              setEditForm({ ...editForm, muscles })
                            }
                          />
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="px-4 py-2.5 rounded-xl bg-neutral-800 text-xs font-bold text-neutral-300 hover:text-white"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void handleSaveEdit(ex.id)}
                            className="px-5 py-2.5 rounded-xl bg-[#22c55e] hover:bg-[#4ade80] text-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {savingEdit ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Guardar cambios
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Clapperboard,
  Download,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Smartphone,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  FileJson,
  Flame,
  Trophy,
  AtSign,
} from 'lucide-react';
import {
  MUSCLE_LABELS,
  MiniMuscleMap,
} from '@/components/workout/MiniMuscleMap';
import type { Exercise, RoutineItem, RoutineMeta } from '@/types/workout';

export interface SavedRoutinePayload {
  version: 2;
  exportedAt: string;
  handle: string;
  meta: RoutineMeta;
  queue: RoutineItem[];
}

export function TiktokSafeZoneOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden select-none"
    >
      {/* Top 12% TikTok UI bar (Search / LIVE / Siguiendo / Para ti) */}
      <div className="absolute top-0 left-0 right-0 h-[12%] bg-rose-500/20 border-b border-dashed border-rose-400/70 flex items-center justify-center px-4">
        <span className="rounded-md bg-black/75 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-rose-300 border border-rose-400/40">
          Zona Superior TikTok (12% · Búsqueda / Para ti)
        </span>
      </div>

      {/* Right 16% TikTok Icon Rail (Avatar, Like, Comments, Share) */}
      <div className="absolute top-[36%] bottom-[20%] right-0 w-[16%] bg-amber-500/20 border-l border-dashed border-amber-400/70 flex flex-col items-center justify-center gap-3 px-1">
        <span className="rounded-md bg-black/80 px-1.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-300 text-center leading-tight border border-amber-400/40">
          Iconos TikTok 16%
        </span>
      </div>

      {/* Bottom 20% TikTok Caption & Audio Ticker */}
      <div className="absolute bottom-0 left-0 right-0 h-[20%] bg-rose-500/20 border-t border-dashed border-rose-400/70 flex flex-col items-center justify-center px-4 text-center">
        <span className="rounded-md bg-black/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-300 border border-rose-400/40">
          Zona Inferior TikTok (20% · @Usuario, Descripción y Audio)
        </span>
      </div>

      {/* Inner Safe Frame Border */}
      <div className="absolute top-[12%] bottom-[20%] left-3 right-[16%] border border-dashed border-[#4ade80]/65 rounded-2xl">
        <span className="absolute top-2 left-2.5 rounded bg-[#080b09]/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#4ade80] border border-[#22c55e]/40">
          Área Segura TikTok 9:16
        </span>
      </div>
    </div>
  );
}

interface TiktokCreatorModalProps {
  open: boolean;
  onClose: () => void;
  meta: RoutineMeta | null;
  queue: RoutineItem[];
  handle: string;
  onChangeHandle: (nextHandle: string) => void;
  showWatermark: boolean;
  onToggleWatermark: () => void;
  onEnterCreatorRecording: () => void;
  onLoadRoutineJson: (payload: {
    meta: RoutineMeta;
    queue: RoutineItem[];
    handle?: string;
  }) => void;
}

const SUMMARY_TOTAL_SECONDS = 14.0;
const HOOK_END = 2.6;
const CUTS_END = 10.6;
const MUSCLES_END = 12.5;

export function TiktokCreatorModal({
  open,
  onClose,
  meta,
  queue,
  handle,
  onChangeHandle,
  showWatermark,
  onToggleWatermark,
  onEnterCreatorRecording,
  onLoadRoutineJson,
}: TiktokCreatorModalProps) {
  const prefersReducedMotion = useReducedMotion();

  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [fullscreenSummary, setFullscreenSummary] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [studioAvailable, setStudioAvailable] = useState<boolean | null>(null);
  const [renderingMp4, setRenderingMp4] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const circuitClips: Exercise[] = useMemo(() => {
    if (!meta?.circuit || meta.circuit.length === 0) return [];
    return meta.circuit.slice(0, 6);
  }, [meta]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/studio/render-summary')
      .then((res) => {
        if (!cancelled) {
          setStudioAvailable(res.ok);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStudioAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isPlaying || countdown !== null) return;

    const tickMs = 80;
    const timer = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + tickMs / 1000;
        if (next >= SUMMARY_TOTAL_SECONDS) {
          return 0;
        }
        return next;
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [open, isPlaying, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        setElapsed(0);
        setIsPlaying(true);
      } else {
        setCountdown((prev) => (prev !== null ? prev - 1 : null));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!open) return null;

  const cleanHandle = handle.trim()
    ? handle.trim().startsWith('@')
      ? handle.trim()
      : `@${handle.trim()}`
    : '@everydaym';

  const totalMinutes = meta
    ? Math.max(1, Math.round(meta.totalSeconds / 60))
    : 30;
  const totalSeries = meta
    ? Math.max(1, meta.rounds * meta.exercisesPerRound)
    : 15;

  // Determine current scene in 14s summary timeline
  const scene: 'hook' | 'cuts' | 'muscles' | 'outro' =
    elapsed < HOOK_END
      ? 'hook'
      : elapsed < CUTS_END
        ? 'cuts'
        : elapsed < MUSCLES_END
          ? 'muscles'
          : 'outro';

  const cutCount = Math.max(1, circuitClips.length);
  const cutWindowSeconds = (CUTS_END - HOOK_END) / cutCount;
  const activeCutIndex =
    scene === 'cuts'
      ? Math.min(
          cutCount - 1,
          Math.max(0, Math.floor((elapsed - HOOK_END) / cutWindowSeconds)),
        )
      : 0;
  const activeCutExercise: Exercise | undefined =
    circuitClips[activeCutIndex] ?? meta?.background;

  const bgVideoUrl =
    meta?.background?.video_url ?? circuitClips[0]?.video_url ?? '';

  const handleExportRoutineJson = () => {
    if (!meta || queue.length === 0) {
      setStatusBanner({
        kind: 'error',
        text: 'Genera primero una rutina para poder exportarla como JSON.',
      });
      return;
    }

    const payload: SavedRoutinePayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      handle: cleanHandle,
      meta,
      queue,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'everydaym-routine.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatusBanner({
      kind: 'success',
      text: 'Rutina guardada como everydaym-routine.json. Puedes usarla para grabar en OBS y para el resumen MP4.',
    });
  };

  const handleImportRoutineFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SavedRoutinePayload>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !parsed.meta ||
        !Array.isArray(parsed.queue) ||
        parsed.queue.length === 0
      ) {
        throw new Error(
          'El archivo JSON no contiene una rutina válida de EverydayM.',
        );
      }

      onLoadRoutineJson({
        meta: parsed.meta,
        queue: parsed.queue,
        handle: parsed.handle,
      });
      setElapsed(0);
      setIsPlaying(true);
      setStatusBanner({
        kind: 'success',
        text: `Rutina "${parsed.meta.focusLabel || 'Personalizada'}" cargada (${parsed.queue.length} bloques).`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al leer el archivo everydaym-routine.json.';
      setStatusBanner({ kind: 'error', text: msg });
    }
  };

  const handleExportMp4 = async () => {
    if (!meta) {
      setStatusBanner({
        kind: 'error',
        text: 'Genera o importa primero una rutina para renderizar el MP4.',
      });
      return;
    }

    setRenderingMp4(true);
    setStatusBanner(null);

    try {
      const res = await fetch('/api/studio/render-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta, handle: cleanHandle }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errData.error ??
            `No se pudo renderizar el MP4 (HTTP ${res.status}). Asegúrate de estar en EverydayM Studio local.`,
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'everydaym-tiktok-summary.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatusBanner({
        kind: 'success',
        text: '¡Resumen MP4 (1080×1920 · 30fps) renderizado con FFmpeg y descargado!',
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al exportar el resumen MP4.';
      setStatusBanner({ kind: 'error', text: msg });
    } finally {
      setRenderingMp4(false);
    }
  };

  const startFullscreenSummaryCountdown = () => {
    setFullscreenSummary(true);
    setIsPlaying(false);
    setElapsed(0);
    setCountdown(3);
  };

  const summaryStage = (
    <div
      className={`relative aspect-[9/16] bg-[#060907] overflow-hidden select-none shadow-[0_24px_80px_rgba(0,0,0,0.95)] ${
        fullscreenSummary
          ? 'h-screen w-auto rounded-none border-0'
          : 'w-full max-w-[330px] mx-auto rounded-[28px] border border-[#22c55e]/40'
      }`}
    >
      {/* Background / Active Clip Video */}
      {scene === 'cuts' && activeCutExercise?.video_url ? (
        <video
          key={`cut-${activeCutIndex}-${activeCutExercise.video_url}`}
          src={activeCutExercise.video_url}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={(e) => {
            if (e.currentTarget.duration > 3) {
              e.currentTarget.currentTime = 1.2;
            }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : bgVideoUrl ? (
        <video
          key={`bg-${bgVideoUrl}`}
          src={bgVideoUrl}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-45 scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1910] via-[#070b08] to-[#0f2416]" />
      )}

      {/* Atmospheric Neon Gradient Overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          scene === 'cuts'
            ? 'bg-gradient-to-b from-black/80 via-black/20 to-black/90'
            : 'bg-gradient-to-b from-[#060907]/90 via-[#0a140d]/80 to-[#060907]/95'
        }`}
      />

      {/* TikTok Safe Zone Guide Overlay */}
      <TiktokSafeZoneOverlay visible={showSafeZones} />

      {/* Safe-Zone Inner Content Container (respects top 12%, bottom 20%, right 16%) */}
      <div className="absolute top-[13.5%] bottom-[21.5%] left-4 right-[17.5%] z-20 flex flex-col justify-between">
        {/* Top Row: Watermark + Scene Pill */}
        <div className="flex items-center justify-between gap-2">
          {showWatermark ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/50 bg-black/75 px-3 py-1 text-[11px] font-black tracking-wider text-[#4ade80] backdrop-blur-md shadow-[0_0_15px_rgba(34,197,94,0.25)]">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
              {cleanHandle}
            </span>
          ) : (
            <span />
          )}

          <span className="rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-200 backdrop-blur-md">
            {scene === 'hook'
              ? 'GANCHO'
              : scene === 'cuts'
                ? `CORTE ${activeCutIndex + 1}/${cutCount}`
                : scene === 'muscles'
                  ? 'MAPA MUSCULAR'
                  : 'ENTRENA HOY'}
          </span>
        </div>

        {/* Center / Dynamic Scene Content */}
        <AnimatePresence mode="wait">
          {scene === 'hook' && (
            <motion.div
              key="scene-hook"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              className="my-auto space-y-3"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/50 bg-[#22c55e]/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#4ade80]">
                <Flame className="w-3.5 h-3.5" /> Rutina del Día · EverydayM
              </span>

              <h3 className="text-3xl font-black uppercase italic tracking-tight text-white leading-[0.95] drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
                <span className="text-[#4ade80] block">{totalMinutes} MIN</span>
                {meta?.focusLabel || 'Full Body Intenso'}
              </h3>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <div className="rounded-xl border border-[#22c55e]/35 bg-black/75 p-2 text-center backdrop-blur-md">
                  <span className="block text-base font-black text-white">
                    {meta?.rounds ?? 3}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-300">
                    Rondas
                  </span>
                </div>
                <div className="rounded-xl border border-[#22c55e]/35 bg-black/75 p-2 text-center backdrop-blur-md">
                  <span className="block text-base font-black text-[#4ade80]">
                    {meta?.exercisesPerRound ?? cutCount}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-300">
                    Ejercicios
                  </span>
                </div>
                <div className="rounded-xl border border-[#22c55e]/35 bg-black/75 p-2 text-center backdrop-blur-md">
                  <span className="block text-base font-black text-white">
                    Nv.{meta?.difficulty ?? 6}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-300">
                    Dificultad
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {scene === 'cuts' && (
            <motion.div
              key={`scene-cut-${activeCutIndex}`}
              initial={
                prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="mt-auto space-y-2.5"
            >
              {/* Step Counter Pill */}
              <div className="inline-flex items-center gap-2 rounded-xl border border-[#4ade80]/50 bg-black/80 px-3 py-1.5 backdrop-blur-md">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#22c55e] text-xs font-black text-black">
                  0{activeCutIndex + 1}
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#4ade80]">
                  Ejercicio {activeCutIndex + 1} de {cutCount}
                </span>
              </div>

              {/* Exercise Title Card */}
              <div className="rounded-2xl border border-[#22c55e]/40 bg-[#080b09]/90 p-3.5 backdrop-blur-xl shadow-2xl">
                <h4 className="text-xl font-black uppercase italic tracking-tight text-white leading-tight">
                  {activeCutExercise?.title ?? 'Ejercicio de Circuito'}
                </h4>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-lg bg-[#22c55e] px-2.5 py-0.5 text-[10px] font-black uppercase text-black">
                    {activeCutExercise?.muscle ?? 'Full Body'}
                  </span>
                  <span className="rounded-lg border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-200">
                    Slot {meta?.slotSeconds ?? 50}s
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {scene === 'muscles' && (
            <motion.div
              key="scene-muscles"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="my-auto space-y-2.5"
            >
              <div className="rounded-2xl border border-[#22c55e]/40 bg-[#0b120d]/90 p-3.5 backdrop-blur-xl">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4ade80] block mb-1">
                  Activación Muscular Total
                </span>
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1.5">
                    <p className="text-lg font-black uppercase italic text-white leading-none">
                      {totalSeries} Series · {totalMinutes} Min
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(meta?.muscles ?? []).slice(0, 4).map((m) => (
                        <span
                          key={m.id}
                          className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                            m.role === 'primary'
                              ? 'bg-[#22c55e] text-black'
                              : 'bg-yellow-400/20 text-yellow-200 border border-yellow-400/40'
                          }`}
                        >
                          {MUSCLE_LABELS[m.id]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <MiniMuscleMap
                    muscles={meta?.muscles ?? []}
                    size="sm"
                    className="shrink-0"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {scene === 'outro' && (
            <motion.div
              key="scene-outro"
              initial={
                prefersReducedMotion ? false : { opacity: 0, scale: 0.94 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="my-auto text-center space-y-3"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#4ade80]/60 bg-[#22c55e]/20 shadow-[0_0_30px_rgba(34,197,94,0.45)]">
                <Trophy className="w-7 h-7 text-[#4ade80]" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#4ade80] block">
                  EVERYDAY M
                </span>
                <h4 className="text-2xl font-black uppercase italic tracking-tight text-white mt-0.5">
                  ¡Guarda esta rutina!
                </h4>
                <p className="text-xs font-bold text-neutral-300 mt-1">
                  {totalMinutes} min · {meta?.rounds ?? 3} rondas ·{' '}
                  {cleanHandle}
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#22c55e] px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                Entrena Cada Día 💪
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Progress Bar inside Safe Zone */}
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-neutral-300">
            <span>Resumen TikTok 9:16</span>
            <span className="tabular-nums text-[#4ade80]">
              {elapsed.toFixed(1)}s / {SUMMARY_TOTAL_SECONDS.toFixed(0)}s
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#22c55e] to-[#4ade80] transition-all duration-75"
              style={{
                width: `${Math.min(100, (elapsed / SUMMARY_TOTAL_SECONDS) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 3-2-1 Clapperboard Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6">
          <span className="text-xs font-black uppercase tracking-[0.28em] text-[#4ade80] mb-2">
            Grabando Resumen TikTok
          </span>
          <span className="text-7xl font-black text-white tabular-nums drop-shadow-[0_0_30px_rgba(34,197,94,0.8)]">
            {countdown}
          </span>
          <p className="mt-3 text-xs font-semibold text-neutral-300">
            Pulsa Grabar en OBS · Empieza automáticamente
          </p>
        </div>
      )}
    </div>
  );

  if (fullscreenSummary) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050706] flex items-center justify-center">
        {summaryStage}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={startFullscreenSummaryCountdown}
            className="rounded-xl border border-[#22c55e]/40 bg-black/80 px-3 py-2 text-xs font-black uppercase tracking-wider text-[#4ade80]"
          >
            Claqueta 3-2-1
          </button>
          <button
            type="button"
            onClick={() => setShowSafeZones((prev) => !prev)}
            className="rounded-xl border border-white/20 bg-black/80 px-3 py-2 text-xs font-bold text-white"
          >
            Zonas (G)
          </button>
          <button
            type="button"
            onClick={() => setFullscreenSummary(false)}
            className="rounded-xl border border-white/20 bg-black/80 p-2 text-white"
            aria-label="Salir de pantalla completa"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio Creador TikTok 9:16 y Resumen 10-15s"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-5xl rounded-[32px] border border-[#22c55e]/35 bg-[#0e1410]/95 p-5 sm:p-6 lg:p-7 shadow-[0_24px_90px_rgba(0,0,0,0.95)] my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 mb-5">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.22em] text-[#4ade80]">
              <Clapperboard className="w-4 h-4" /> EverydayM Creator Suite · 9:16
            </span>
            <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white mt-0.5">
              Pack TikTok: Rutina OBS + Resumen 14s MP4
            </h2>
            <p className="text-xs text-neutral-300 mt-1">
              Genera los dos vídeos desde la misma rutina: (1) la sesión completa
              de 20–40 min limpia en 9:16 para OBS y (2) el resumen vertical de
              14s en MP4 (1080×1920 a 30fps).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Estudio TikTok"
            className="rounded-2xl border border-white/15 bg-white/5 p-2.5 text-neutral-300 hover:text-white hover:border-[#4ade80] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusBanner && (
          <div
            className={`mb-5 flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs font-bold ${
              statusBanner.kind === 'error'
                ? 'border-red-500/35 bg-red-500/10 text-red-200'
                : 'border-[#22c55e]/40 bg-[#22c55e]/15 text-[#4ade80]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusBanner.kind === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#4ade80]" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: 9:16 Interactive Animated Summary Preview */}
          <div className="lg:col-span-5 flex flex-col items-center space-y-3">
            {summaryStage}

            {/* Summary Transport Controls */}
            <div className="w-full max-w-[330px] flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#121914] p-2.5">
              <button
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black hover:bg-[#4ade80] transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" /> Pausa
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-black" /> Play
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setElapsed(0);
                  setIsPlaying(true);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:text-white"
                title="Reiniciar vista previa"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#4ade80]" /> 0s
              </button>

              <button
                type="button"
                onClick={() => setShowSafeZones((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  showSafeZones
                    ? 'border-[#4ade80] bg-[#22c55e]/20 text-[#4ade80]'
                    : 'border-white/15 bg-white/5 text-neutral-300 hover:text-white'
                }`}
                title="Mostrar zonas seguras de TikTok"
              >
                {showSafeZones ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                Zonas
              </button>

              <button
                type="button"
                onClick={() => setFullscreenSummary(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1.5 text-neutral-200 hover:text-[#4ade80]"
                title="Pantalla completa 9:16"
                aria-label="Pantalla completa 9:16"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Watermark Config, Video 1 (Full OBS Mode), Video 2 (MP4 Export), JSON Save/Load */}
          <div className="lg:col-span-7 space-y-4">
            {/* Watermark & Safe-Zone Configuration */}
            <div className="rounded-3xl border border-white/10 bg-[#121914]/95 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center gap-1.5">
                  <AtSign className="w-3.5 h-3.5" /> Marca de Agua y Formato
                  TikTok
                </span>
                <button
                  type="button"
                  onClick={onToggleWatermark}
                  className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-colors ${
                    showWatermark
                      ? 'border-[#4ade80] bg-[#22c55e]/20 text-[#4ade80]'
                      : 'border-white/15 bg-white/5 text-neutral-400'
                  }`}
                >
                  {showWatermark ? 'Marca de agua: ON' : 'Marca de agua: OFF'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => onChangeHandle(e.target.value)}
                  placeholder="@everydaym"
                  aria-label="Usuario o marca de agua de TikTok"
                  className="flex-1 rounded-xl border border-white/15 bg-[#090d0a] px-3.5 py-2 text-sm font-bold text-white focus:border-[#4ade80] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowSafeZones((prev) => !prev)}
                  className="rounded-xl border border-[#22c55e]/35 bg-[#162119] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-[#4ade80] hover:bg-[#1e2d22]"
                >
                  {showSafeZones
                    ? 'Ocultar Guía TikTok'
                    : 'Ver Guía Zonas Seguras'}
                </button>
              </div>
            </div>

            {/* VIDEO 1: Full Routine (20-40 min) -> OBS Creator Recording Mode */}
            <div className="rounded-3xl border border-[#22c55e]/35 bg-[#121914]/95 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4ade80] flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> Vídeo 1 · Rutina
                    Completa ({totalMinutes} min)
                  </span>
                  <h3 className="text-base font-black uppercase text-white mt-0.5">
                    Modo Grabación 9:16 para OBS Studio (/?rec=1)
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1">
                    Escenario 9:16 puro sin botones ni cursor, música desactivada
                    por defecto para añadir audio en TikTok, claqueta 3-2-1 y
                    atajos de teclado invisibles (Espacio, ←/→, M, G, Esc).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEnterCreatorRecording();
                }}
                disabled={!meta || queue.length === 0}
                className="w-full rounded-2xl bg-[#22c55e] hover:bg-[#4ade80] py-3 px-4 text-xs font-black uppercase tracking-widest text-black shadow-[0_8px_25px_rgba(34,197,94,0.35)] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Clapperboard className="w-4 h-4" />
                Abrir Modo Grabación 9:16 (Claqueta 3-2-1)
              </button>
            </div>

            {/* VIDEO 2: 10-15s Summary MP4 Renderer */}
            <div className="rounded-3xl border border-[#22c55e]/35 bg-[#121914]/95 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4ade80] flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" /> Vídeo 2 · Resumen TikTok
                    14s (1080×1920 · 30fps)
                  </span>
                  <h3 className="text-base font-black uppercase text-white mt-0.5">
                    Exportación Directa a MP4 con FFmpeg
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1">
                    Genera un archivo <code>everydaym-tiktok-summary.mp4</code>{' '}
                    con gancho, cortes rápidos de cada ejercicio del circuito,
                    volumen total y cierre con CTA.
                  </p>
                </div>
                {studioAvailable !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      studioAvailable
                        ? 'bg-[#22c55e]/20 text-[#4ade80] border border-[#22c55e]/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    }`}
                  >
                    {studioAvailable ? 'Studio Local Activo' : 'Solo en Studio PC'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleExportMp4()}
                  disabled={renderingMp4 || !meta || studioAvailable === false}
                  className="rounded-2xl bg-[#22c55e] hover:bg-[#4ade80] py-3 px-4 text-xs font-black uppercase tracking-wider text-black shadow-[0_8px_25px_rgba(34,197,94,0.35)] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {renderingMp4 ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Renderizando MP4...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Exportar Resumen MP4
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={startFullscreenSummaryCountdown}
                  disabled={!meta}
                  className="rounded-2xl border border-[#22c55e]/45 bg-[#17231b] hover:bg-[#1e2f24] py-3 px-4 text-xs font-black uppercase tracking-wider text-[#4ade80] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  Resumen 9:16 Pantalla Completa
                </button>
              </div>
            </div>

            {/* Save / Load Routine JSON */}
            <div className="rounded-3xl border border-white/10 bg-[#121914]/95 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-neutral-200 flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-[#4ade80]" /> Guardar /
                  Cargar Rutina (everydaym-routine.json)
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Guarda la rutina generada en JSON para reutilizar exactamente los
                mismos ejercicios y tiempos tanto en la grabación larga de OBS
                como en el resumen corto.
              </p>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleExportRoutineJson}
                  disabled={!meta || queue.length === 0}
                  className="rounded-xl border border-[#22c55e]/35 bg-[#162119] hover:bg-[#1e2e23] py-2.5 px-3 text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> Guardar JSON
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 py-2.5 px-3 text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-[#4ade80]" /> Cargar JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void handleImportRoutineFile(e)}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

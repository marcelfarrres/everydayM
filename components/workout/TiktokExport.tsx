'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Download, Film, Sparkles, X } from 'lucide-react';
import type { RoutineItem, RoutineMeta } from '@/types/workout';

type Mode = 'summary' | 'full';
type Phase =
  | { at: 'choose' }
  | { at: 'running'; mode: Mode; id: string; progress: number; step: string }
  | { at: 'done'; mode: Mode; id: string }
  | { at: 'error'; message: string };

const EASE = [0.16, 1, 0.3, 1] as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const ENDPOINT = '/api/studio/tiktok';

/**
 * Turns today's routine into a real MP4 for TikTok, rendered by the Studio (FFmpeg on this
 * computer): a 15 s teaser to post, or the whole routine to follow along.
 */
export function TiktokExport({
  open,
  onClose,
  queue,
  meta,
  prompt = '',
}: {
  open: boolean;
  onClose: () => void;
  queue: RoutineItem[];
  meta: RoutineMeta | null | undefined;
  prompt?: string;
}) {
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });
  const [handle, setHandle] = useState('@everydaym');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Follow the render while it runs.
  const runningId = phase.at === 'running' ? phase.id : null;
  const runningMode = phase.at === 'running' ? phase.mode : null;
  useEffect(() => {
    if (!runningId || !runningMode) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${ENDPOINT}?id=${runningId}`, { cache: 'no-store' });
        const data = (await res.json()) as { status?: string; progress?: number; step?: string; error?: string };
        if (data.status === 'done') setPhase({ at: 'done', mode: runningMode, id: runningId });
        else if (data.status === 'error' || !res.ok) setPhase({ at: 'error', message: data.error ?? 'No se pudo crear el vídeo.' });
        else setPhase({ at: 'running', mode: runningMode, id: runningId, progress: data.progress ?? 0, step: data.step ?? '' });
      } catch {
        // a missed poll is fine; the next one catches up
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [runningId, runningMode]);

  const minutes = meta ? Math.max(1, Math.round(meta.totalSeconds / 60)) : 0;

  const start = async (mode: Mode) => {
    if (!meta) return;
    setPhase({ at: 'running', mode, id: '', progress: 0, step: 'Empezando' });
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, queue, meta, handle, prompt }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.status === 404) {
        setPhase({ at: 'error', message: 'Los vídeos se crean en el ordenador del Estudio. Abre la app desde ahí (o por la WiFi de casa).' });
      } else if (!res.ok || !data.id) {
        setPhase({ at: 'error', message: data.error ?? 'No se pudo empezar.' });
      } else {
        setPhase({ at: 'running', mode, id: data.id, progress: 0, step: 'Empezando' });
      }
    } catch {
      setPhase({ at: 'error', message: 'Sin conexión con el Estudio.' });
    }
  };

  const options: { mode: Mode; icon: typeof Film; title: string; length: string; detail: string; wait: string }[] = [
    {
      mode: 'summary',
      icon: Sparkles,
      title: 'Resumen',
      length: '≈ 20 s',
      detail: 'Tu frase escribiéndose, Marcel, el plan y un vistazo a cada ejercicio.',
      wait: 'Listo en unos 20 s',
    },
    {
      mode: 'full',
      icon: Film,
      title: 'Rutina completa',
      length: `${minutes} min`,
      detail: 'Entera, con cuenta atrás, rondas y descansos. Para seguirla.',
      wait: `Listo en unos ${Math.max(1, Math.round((minutes * 10) / 60))} min`,
    },
  ];

  const percent = phase.at === 'running' ? Math.round(phase.progress * 100) : 0;
  const ring = 2 * Math.PI * 52;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Vídeo para TikTok"
      className="m-auto w-[min(94vw,30rem)] overflow-hidden rounded-[32px] bg-paper p-0 font-[family-name:var(--font-display)] text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">TikTok · 9:16</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
              {phase.at === 'done' ? 'Tu vídeo' : 'Crear vídeo'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/8 hover:bg-ink/15 ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {phase.at === 'choose' && (
            <motion.div
              key="choose"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex flex-col gap-3"
            >
              {options.map((option, i) => (
                <motion.button
                  key={option.mode}
                  type="button"
                  disabled={!meta}
                  onClick={() => void start(option.mode)}
                  initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + i * 0.07, duration: 0.45, ease: EASE }}
                  whileHover={reducedMotion ? undefined : { y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className={`group flex items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-[0_16px_34px_-26px_rgba(0,0,0,0.5)] disabled:opacity-40 ${FOCUS}`}
                >
                  <span className="flex aspect-[9/16] w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-colors group-hover:bg-heat">
                    <option.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-xl font-semibold tracking-[-0.01em]">{option.title}</span>
                      <span className="text-lg font-bold tabular-nums">{option.length}</span>
                    </span>
                    <span className="mt-1 block text-[15px] leading-snug text-ink/60">{option.detail}</span>
                    <span className="mt-1 block text-[13px] font-semibold text-ink/45">{option.wait}</span>
                  </span>
                </motion.button>
              ))}
              <label className="mt-2 flex items-center gap-3 rounded-2xl bg-ink/6 px-4">
                <span className="text-[15px] font-medium text-ink/55">Tu usuario</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  maxLength={30}
                  className="min-h-12 min-w-0 flex-1 bg-transparent text-right text-[17px] font-semibold focus:outline-none"
                />
              </label>
              <p className="text-[13px] leading-snug text-ink/50">
                Sin música: añade el sonido en TikTok. Se crea en el ordenador del Estudio.
              </p>
            </motion.div>
          )}

          {phase.at === 'running' && (
            <motion.div
              key="running"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex flex-col items-center gap-5 py-6 text-center"
              role="status"
              aria-live="polite"
            >
              <div className="relative h-36 w-36">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" className="stroke-ink/10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={ring}
                    strokeDashoffset={ring * (1 - phase.progress)}
                    className="stroke-heat transition-[stroke-dashoffset] duration-1000 ease-linear"
                  />
                </svg>
                {!reducedMotion && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2 border-heat/30"
                    animate={{ scale: [1, 1.12], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums tracking-[-0.03em]">
                  {percent}%
                </span>
              </div>
              <div>
                <p className="text-xl font-semibold">{phase.mode === 'full' ? 'Montando la rutina completa' : 'Montando el resumen'}</p>
                <p className="mt-1 text-[15px] text-ink/55">{phase.step}</p>
              </div>
            </motion.div>
          )}

          {phase.at === 'done' && (
            <motion.div
              key="done"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex flex-col items-center gap-4"
            >
              <video
                src={`${ENDPOINT}?id=${phase.id}&file=1`}
                controls
                playsInline
                autoPlay
                muted
                className="aspect-[9/16] h-[min(52dvh,30rem)] rounded-3xl bg-black object-cover"
              />
              <a
                href={`${ENDPOINT}?id=${phase.id}&file=1&download=1`}
                download
                className={`flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] ${FOCUS}`}
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                Descargar MP4
              </a>
              <button
                type="button"
                onClick={() => setPhase({ at: 'choose' })}
                className={`min-h-11 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-ink ${FOCUS}`}
              >
                Crear otro
              </button>
            </motion.div>
          )}

          {phase.at === 'error' && (
            <motion.div
              key="error"
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-4"
            >
              <p role="alert" className="text-[17px] leading-snug">
                {phase.message}
              </p>
              <button
                type="button"
                onClick={() => setPhase({ at: 'choose' })}
                className={`flex h-14 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white ${FOCUS}`}
              >
                Volver
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </dialog>
  );
}

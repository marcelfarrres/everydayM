'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Copy, Download, Film, Images, Lightbulb, ListOrdered, RefreshCw, Sparkles, Timer, X } from 'lucide-react';
import type { ClipQueueItem } from '@/lib/clips/queue';
import { CLIP_TYPE_DESCRIPTIONS, CLIP_TYPE_LENGTHS, CLIP_TYPE_NAMES, ROUTINE_CLIP_TYPES, type ClipType } from '@/lib/clips/types';
import type { RoutineItem, RoutineMeta } from '@/types/workout';

type Mode = ClipType;
type Idea = {
  title: string;
  hook: string;
  why: string;
  shots: { seconds: number; what: string; text?: string }[];
  filmMinutes: number;
  caption: string;
  pairWith: Mode;
};
type Phase =
  | { at: 'choose' }
  | { at: 'running'; mode: Mode; id: string; progress: number; step: string }
  | { at: 'done'; mode: Mode; id: string; slides: number; caption: string; notes: string[] }
  | { at: 'error'; message: string };

const EASE = [0.16, 1, 0.3, 1] as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
// Clips go to the Studio's queue (lib/server/clips/queue.ts), the same one the Studio shows.
const ENDPOINT = '/api/studio/clips';

const NAMES: Record<Mode, string> = CLIP_TYPE_NAMES;
// What only this dialog needs per type; names and descriptions live in lib/clips/types.ts.
const ICONS: Partial<Record<Mode, typeof Film>> = { summary: Sparkles, full: Film, top3: ListOrdered, challenge: Timer, carousel: Images };

/** Copy to the clipboard, falling back to selecting the text when the browser refuses. */
function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        readOnly
        value={text}
        rows={4}
        className="w-full resize-none rounded-2xl bg-ink/6 p-3 pr-12 text-[14px] leading-snug text-ink/80 focus:outline-none"
      />
      <button
        type="button"
        aria-label="Copiar"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            ref.current?.select();
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow ${FOCUS}`}
      >
        {copied ? <Check className="h-4 w-4 text-heat" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * Everything for TikTok in one place: an idea for today's own clip (to film in a few minutes)
 * and the clips the Studio renders from today's routine. Each one goes to the Studio's clip
 * queue (Estudio → Clips), where it can also be reviewed and downloaded later.
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
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);

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
        const res = await fetch(`${ENDPOINT}/${runningId}`, { cache: 'no-store' });
        const data = (await res.json()) as { item?: ClipQueueItem; error?: string };
        const item = data.item;
        if (!res.ok || !item) setPhase({ at: 'error', message: data.error ?? 'No se pudo crear el vídeo.' });
        else if (item.status === 'failed') setPhase({ at: 'error', message: item.error ?? 'No se pudo crear el vídeo.' });
        else if (item.status !== 'rendering') setPhase({ at: 'done', mode: runningMode, id: runningId, slides: item.slides, caption: item.caption, notes: item.notes });
        else setPhase({ at: 'running', mode: runningMode, id: runningId, progress: item.progress, step: item.step });
      } catch {
        // a missed poll is fine; the next one catches up
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [runningId, runningMode]);

  const minutes = meta ? Math.max(1, Math.round(meta.totalSeconds / 60)) : 0;

  const askIdea = async () => {
    if (!meta) return;
    setIdeaLoading(true);
    try {
      const res = await fetch('/api/studio/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta, avoid: seen }),
      });
      const data = (await res.json()) as { idea?: Idea };
      if (data.idea) {
        setIdea(data.idea);
        setSeen((s) => [...s, data.idea!.title].slice(-8));
      }
    } finally {
      setIdeaLoading(false);
    }
  };

  const start = async (mode: Mode) => {
    if (!meta) return;
    setPhase({ at: 'running', mode, id: '', progress: 0, step: 'Empezando' });
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mode, routine: { queue, meta, prompt }, handle }),
      });
      const data = (await res.json().catch(() => ({}))) as { item?: ClipQueueItem; error?: string };
      if (res.status === 404) {
        setPhase({ at: 'error', message: 'Los vídeos se crean en el ordenador del Estudio. Abre la app desde ahí (o por la WiFi de casa).' });
      } else if (!res.ok || !data.item) {
        setPhase({ at: 'error', message: data.error ?? 'No se pudo empezar.' });
      } else {
        setPhase({ at: 'running', mode, id: data.item.id, progress: data.item.progress, step: data.item.step });
      }
    } catch {
      setPhase({ at: 'error', message: 'Sin conexión con el Estudio.' });
    }
  };

  const options: { mode: Mode; icon: typeof Film; length: string; detail: string }[] = ROUTINE_CLIP_TYPES.map((mode) => ({
    mode,
    icon: ICONS[mode] ?? Film,
    length: mode === 'full' ? `${minutes} min` : CLIP_TYPE_LENGTHS[mode],
    detail: CLIP_TYPE_DESCRIPTIONS[mode],
  }));

  const percent = phase.at === 'running' ? Math.round(phase.progress * 100) : 0;
  const ring = 2 * Math.PI * 52;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Para TikTok"
      className="m-auto max-h-[92dvh] w-[min(94vw,34rem)] overflow-y-auto rounded-[32px] bg-paper p-0 font-[family-name:var(--font-display)] text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">TikTok · hoy</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{phase.at === 'done' ? NAMES[phase.mode] : 'Para publicar'}</h2>
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
              className="flex flex-col gap-6"
            >
              {/* IDEA FOR TODAY'S OWN CLIP */}
              <section className="rounded-3xl bg-ink p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    <Lightbulb className="h-4 w-4" aria-hidden="true" /> Tu vídeo de hoy
                  </p>
                  {idea && (
                    <button type="button" onClick={() => void askIdea()} disabled={ideaLoading} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white/80 hover:bg-white/10 ${FOCUS}`}>
                      <RefreshCw className={`h-3.5 w-3.5 ${ideaLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Otra
                    </button>
                  )}
                </div>
                {!idea ? (
                  <>
                    <p className="mt-2 text-[15px] leading-snug text-white/70">Una idea para grabar tú en pocos minutos, con su guion, el texto en pantalla y la descripción.</p>
                    <button
                      type="button"
                      onClick={() => void askIdea()}
                      disabled={!meta || ideaLoading}
                      className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-ink disabled:opacity-60 ${FOCUS}`}
                    >
                      {ideaLoading ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                      {ideaLoading ? 'Pensando…' : 'Dame una idea'}
                    </button>
                  </>
                ) : (
                  <div className="mt-3 flex flex-col gap-4">
                    <div>
                      <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">«{idea.hook}»</p>
                      <p className="mt-1 text-[14px] text-white/60">{idea.why}</p>
                    </div>
                    <ol className="flex flex-col gap-2">
                      {idea.shots.map((shot, i) => (
                        <li key={i} className="flex gap-3 rounded-2xl bg-white/8 p-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-bold text-ink">{i + 1}</span>
                          <span className="min-w-0 text-[14px] leading-snug">
                            <span className="font-semibold">{shot.seconds} s · </span>
                            {shot.what}
                            {shot.text && <span className="mt-1 block text-white/60">Texto: «{shot.text}»</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-[13px] font-semibold text-white/60">
                      Lo grabas en unos {idea.filmMinutes} min · publícalo con: {NAMES[idea.pairWith]}
                    </p>
                    <div className="rounded-2xl bg-white text-ink">
                      <CopyBox text={idea.caption} />
                    </div>
                  </div>
                )}
              </section>

              {/* VIDEOS FROM THE APP */}
              <section className="flex flex-col gap-2.5">
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Vídeos de la app</p>
                {options.map((option, i) => (
                  <motion.button
                    key={option.mode}
                    type="button"
                    disabled={!meta}
                    onClick={() => void start(option.mode)}
                    initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + i * 0.05, duration: 0.4, ease: EASE }}
                    whileTap={{ scale: 0.98 }}
                    className={`group flex items-center gap-4 rounded-3xl bg-white p-3.5 text-left shadow-[0_16px_34px_-28px_rgba(0,0,0,0.5)] disabled:opacity-40 ${FOCUS}`}
                  >
                    <span className="flex aspect-[9/16] w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-colors group-hover:bg-heat">
                      <option.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">
                          {NAMES[option.mode]}
                          {idea?.pairWith === option.mode && (
                            <span className="rounded-full bg-heat px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">Hoy</span>
                          )}
                        </span>
                        <span className="text-[15px] font-semibold tabular-nums text-ink/60">{option.length}</span>
                      </span>
                      <span className="mt-0.5 block text-[14px] leading-snug text-ink/60">{option.detail}</span>
                    </span>
                  </motion.button>
                ))}
              </section>

              <label className="flex items-center gap-3 rounded-2xl bg-ink/6 px-4">
                <span className="text-[15px] font-medium text-ink/55">Tu usuario</span>
                <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={30} className="min-h-12 min-w-0 flex-1 bg-transparent text-right text-[17px] font-semibold focus:outline-none" />
              </label>
              <p className="text-[13px] leading-snug text-ink/50">
                Los cortos van sin música: el sonido se pone en TikTok. La rutina completa lleva música. Se montan en el ordenador del Estudio y quedan en su cola de clips.
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
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - phase.progress)} className="stroke-heat transition-[stroke-dashoffset] duration-1000 ease-linear" />
                </svg>
                {!reducedMotion && (
                  <motion.span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-heat/30" animate={{ scale: [1, 1.12], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
                )}
                <span className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums tracking-[-0.03em]">{percent}%</span>
              </div>
              <div>
                <p className="text-xl font-semibold">Montando: {NAMES[phase.mode]}</p>
                <p className="mt-1 text-[15px] text-ink/55">{phase.step}</p>
                <p className="mt-3 text-[13px] text-ink/45">Puedes cerrar: queda en la cola del Estudio (Estudio → Clips).</p>
              </div>
            </motion.div>
          )}

          {phase.at === 'done' && (
            <motion.div key="done" initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="flex flex-col gap-4">
              {phase.mode === 'carousel' ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: phase.slides }, (_, i) => (
                    <a key={i} href={`${ENDPOINT}/${phase.id}/slides/${i}?download=1`} download className="overflow-hidden rounded-2xl bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element -- photos just rendered by the Studio */}
                      <img src={`${ENDPOINT}/${phase.id}/slides/${i}`} alt={`Foto ${i + 1}`} className="aspect-[9/16] w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : (
                <video src={`${ENDPOINT}/${phase.id}/video`} controls playsInline autoPlay muted className="mx-auto aspect-[9/16] h-[min(50dvh,28rem)] rounded-3xl bg-black object-cover" />
              )}
              <a
                href={`${ENDPOINT}/${phase.id}/download`}
                download
                className={`flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] ${FOCUS}`}
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                {phase.mode === 'carousel' ? 'Descargar todas (ZIP)' : 'Descargar MP4'}
              </a>
              {phase.notes.map((note) => (
                <p key={note} className="text-[14px] leading-snug text-ink/60">{note}</p>
              ))}
              {phase.caption && (
                <div>
                  <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Descripción para TikTok</p>
                  <CopyBox text={phase.caption} />
                </div>
              )}
              <a href="/admin#clips" className={`min-h-11 text-center text-[15px] font-medium leading-[2.75rem] text-ink/60 underline underline-offset-4 hover:text-ink ${FOCUS}`}>
                Ver la cola de clips
              </a>
              <button type="button" onClick={() => setPhase({ at: 'choose' })} className={`min-h-11 rounded-full px-4 text-[15px] font-medium text-ink/60 hover:text-ink ${FOCUS}`}>
                Crear otro
              </button>
            </motion.div>
          )}

          {phase.at === 'error' && (
            <motion.div key="error" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
              <p role="alert" className="text-[17px] leading-snug">{phase.message}</p>
              <button type="button" onClick={() => setPhase({ at: 'choose' })} className={`flex h-14 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white ${FOCUS}`}>
                Volver
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </dialog>
  );
}

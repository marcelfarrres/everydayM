'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Download, Film, Images, Loader2, MessageSquare, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { CLIP_STATUS_LABELS, MAX_COMMENT_LENGTH, type ClipQueueItem, type ClipStatus } from '@/lib/clips/queue';
import { CLIP_TYPE_NAMES } from '@/lib/clips/types';
import { FOCUS } from '@/components/studio/StudioUi';
import { formatBytes, formatDuration } from '@/components/studio/studioClient';

/*
 * The clip queue: one card per clip with its poster, what was asked, where it stands, and
 * the actions (watch, approve, reject with a comment, another version, download, delete).
 * Videos only load when opened: the list shows small posters.
 */

export const CLIPS_API = '/api/studio/clips';

export type ClipAction =
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; comment: string }
  | { kind: 'regenerate'; id: string; comment: string }
  | { kind: 'delete'; id: string };

const STATUS_STYLE: Record<ClipStatus, string> = {
  rendering: 'border-ink/25 text-ink/60',
  ready: 'border-ink text-ink',
  approved: 'border-ink bg-ink text-white',
  rejected: 'border-heat text-heat',
  failed: 'border-heat bg-heat text-white',
};

function StatusChip({ status }: { status: ClipStatus }) {
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${STATUS_STYLE[status]}`}>
      {status === 'rendering' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {status === 'approved' && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {CLIP_STATUS_LABELS[status]}
    </span>
  );
}

function CopyCaption({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        readOnly
        value={text}
        rows={4}
        aria-label="Descripción para TikTok"
        className="w-full resize-none rounded-xl border border-ink/15 bg-paper/60 p-3 pr-12 text-[14px] leading-snug text-ink/80 focus:outline-none"
      />
      <button
        type="button"
        aria-label="Copiar la descripción"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            ref.current?.select();
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-ink/20 bg-white ${FOCUS}`}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

const actionClass = `flex h-11 items-center gap-1.5 rounded-full border border-ink/20 px-3.5 text-[14px] font-semibold hover:border-ink disabled:opacity-40 ${FOCUS}`;

function ClipCard({
  item,
  replaced,
  busy,
  onAction,
}: {
  item: ClipQueueItem;
  replaced: boolean;
  busy: boolean;
  onAction: (action: ClipAction) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCaption, setShowCaption] = useState(false);
  const done = item.status === 'ready' || item.status === 'approved' || item.status === 'rejected';
  const photos = item.slides > 0;
  const facts = [
    CLIP_TYPE_NAMES[item.type],
    item.durationSeconds ? formatDuration(item.durationSeconds) : photos ? `${item.slides} fotos` : null,
    item.sizeBytes ? formatBytes(item.sizeBytes) : null,
  ].filter(Boolean);

  return (
    <li className="rounded-2xl bg-white">
      <div className="flex gap-3 p-3">
        <button
          type="button"
          disabled={!done}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Cerrar la vista previa' : 'Ver el clip'}
          className={`relative aspect-[9/16] w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-ink/15 bg-paper ${FOCUS}`}
        >
          {done ? (
            // eslint-disable-next-line @next/next/no-img-element -- small JPEG rendered by the Studio
            <img src={`${CLIPS_API}/${item.id}/poster?v=${encodeURIComponent(item.updatedAt)}`} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-ink/25">
              {photos ? <Images className="h-6 w-6" strokeWidth={1.25} aria-hidden="true" /> : <Film className="h-6 w-6" strokeWidth={1.25} aria-hidden="true" />}
            </span>
          )}
          {done && !open && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-black/35 text-white">
                <Play className="ml-0.5 h-4 w-4" aria-hidden="true" />
              </span>
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[13px] font-semibold text-ink/55">{facts.join(' · ')}</p>
            <StatusChip status={item.status} />
          </div>
          <p className="line-clamp-2 text-[16px] font-semibold leading-snug">{item.instruction}</p>
          {item.exercises.length > 0 && <p className="truncate text-[13px] text-ink/55">{item.exercises.map((e) => e.title).join(' · ')}</p>}
          {item.status === 'rendering' && (
            <div className="mt-1" role="status" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full w-full origin-left rounded-full bg-ink transition-transform duration-700" style={{ transform: `scaleX(${Math.max(0.02, item.progress)})` }} />
              </div>
              <p className="mt-1 text-[13px] text-ink/55">{item.step || 'En cola'}</p>
            </div>
          )}
          {item.status === 'failed' && item.error && <p role="alert" className="text-[13px] font-medium text-heat">{item.error}</p>}
          {item.comment && (
            <p className="flex items-start gap-1.5 text-[13px] text-ink/70">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {item.comment}
            </p>
          )}
          {item.notes.map((note) => (
            <p key={note} className="text-[13px] text-ink/55">{note}</p>
          ))}
          {(item.regeneratedFrom || replaced) && (
            <p className="text-[12px] text-ink/45">{replaced ? 'Ya tiene una versión nueva más arriba.' : 'Otra versión de un clip anterior.'}</p>
          )}
        </div>
      </div>

      {open && done && (
        <div className="border-t border-ink/10 p-3">
          {photos ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: item.slides }, (_, i) => (
                <a key={i} href={`${CLIPS_API}/${item.id}/slides/${i}?download=1`} download className={`overflow-hidden rounded-xl border border-ink/10 ${FOCUS}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- photos rendered by the Studio */}
                  <img src={`${CLIPS_API}/${item.id}/slides/${i}`} alt={`Foto ${i + 1}`} loading="lazy" className="aspect-[9/16] w-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <video
              src={`${CLIPS_API}/${item.id}/video`}
              controls
              playsInline
              autoPlay
              preload="metadata"
              className="mx-auto aspect-[9/16] max-h-[70dvh] w-full max-w-sm rounded-xl bg-black object-contain"
            />
          )}
        </div>
      )}

      {commenting && (
        <div className="flex flex-col gap-2 border-t border-ink/10 p-3">
          <label className="text-[13px] font-semibold text-ink/60" htmlFor={`comment-${item.id}`}>
            ¿Qué cambiarías? Se tiene en cuenta en la próxima versión.
          </label>
          <textarea
            id={`comment-${item.id}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
            placeholder="Ej. mejor de hombro, el texto tapa la cara…"
            className="w-full resize-none rounded-xl border border-ink/20 bg-white p-3 text-[16px] focus:outline-2 focus:outline-ink"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setCommenting(false)} className={`h-11 rounded-full px-4 text-[14px] font-medium text-ink/60 ${FOCUS}`}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onAction({ kind: 'reject', id: item.id, comment })) setCommenting(false);
              }}
              className={`h-11 rounded-full border border-heat px-4 text-[14px] font-semibold text-heat disabled:opacity-40 ${FOCUS}`}
            >
              Rechazar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onAction({ kind: 'regenerate', id: item.id, comment })) setCommenting(false);
              }}
              className={`flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-40 ${FOCUS}`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Rechazar y rehacer
            </button>
          </div>
        </div>
      )}

      {showCaption && item.caption && (
        <div className="border-t border-ink/10 p-3">
          <CopyCaption text={item.caption} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 p-3">
        {done && item.status !== 'approved' && (
          <button type="button" disabled={busy} onClick={() => void onAction({ kind: 'approve', id: item.id })} className={`${actionClass} border-ink bg-ink text-white`}>
            <Check className="h-4 w-4" aria-hidden="true" /> Aprobar
          </button>
        )}
        {done && (
          <a href={`${CLIPS_API}/${item.id}/download`} download className={actionClass}>
            <Download className="h-4 w-4" aria-hidden="true" /> {photos ? 'ZIP' : 'Descargar'}
          </a>
        )}
        {done && !commenting && (
          <button
            type="button"
            onClick={() => {
              setComment(item.comment ?? '');
              setCommenting(true);
            }}
            className={actionClass}
          >
            <X className="h-4 w-4" aria-hidden="true" /> Rechazar…
          </button>
        )}
        {(done || item.status === 'failed') && (
          <button type="button" disabled={busy} onClick={() => void onAction({ kind: 'regenerate', id: item.id, comment: '' })} className={actionClass}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Otra versión
          </button>
        )}
        {done && item.caption && (
          <button type="button" onClick={() => setShowCaption((s) => !s)} aria-expanded={showCaption} className={actionClass}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Descripción
          </button>
        )}
        <span className="ml-auto">
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button type="button" disabled={busy} onClick={() => void onAction({ kind: 'delete', id: item.id })} className={`h-11 rounded-full bg-heat px-4 text-[14px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}>
                Borrar
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`h-11 rounded-full px-3 text-[14px] font-medium text-ink/60 ${FOCUS}`}>
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="Borrar el clip"
              disabled={item.status === 'rendering' && !item.step.startsWith('En cola')}
              onClick={() => setConfirmDelete(true)}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-ink/50 hover:text-heat disabled:opacity-30 ${FOCUS}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

type Filter = 'all' | 'review' | 'approved' | 'rejected';
const FILTERS: Array<{ id: Filter; label: string; match: (s: ClipStatus) => boolean }> = [
  { id: 'all', label: 'Todos', match: () => true },
  { id: 'review', label: 'Por revisar', match: (s) => s === 'ready' || s === 'rendering' || s === 'failed' },
  { id: 'approved', label: 'Aprobados', match: (s) => s === 'approved' },
  { id: 'rejected', label: 'Rechazados', match: (s) => s === 'rejected' },
];

export function ClipsQueue({
  items,
  loading,
  busyId,
  onAction,
}: {
  items: ClipQueueItem[];
  loading: boolean;
  busyId: string | null;
  onAction: (action: ClipAction) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const replaced = new Set(items.map((i) => i.regeneratedFrom).filter((id): id is string => Boolean(id)));
  const shown = items.filter((i) => FILTERS.find((f) => f.id === filter)!.match(i.status));

  return (
    <section aria-label="Cola de clips" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Cola</h2>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-9 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold ${filter === f.id ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink/60'} ${FOCUS}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-ink/55">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando la cola…
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink/20 py-12 text-center text-[15px] text-ink/55">
          {items.length === 0 ? 'Aún no hay clips. Escribe uno arriba.' : 'Nada en este filtro.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <ClipCard key={item.id} item={item} replaced={replaced.has(item.id)} busy={busyId === item.id} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  );
}

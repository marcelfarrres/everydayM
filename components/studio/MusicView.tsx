'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Music, Plus, Trash2 } from 'lucide-react';
import type { MusicStyle, MusicTrack } from '@/types/catalog';
import { MUSIC_STYLES, MUSIC_STYLE_LABELS, toMusicStyle } from '@/lib/musicStyles';
import { FOCUS, TextField, fieldClass, type BannerMessage } from '@/components/studio/StudioUi';
import {
  formatBytes,
  formatDuration,
  jsonBody,
  studioJson,
  titleFromFilename,
  uploadFile,
} from '@/components/studio/studioClient';

type TrackFields = { title: string; artist: string; source_url: string; license: string; style: MusicStyle | '' };

/** Which tracks the list shows: all, one style, or those still without one. */
type ListFilter = 'all' | 'none' | MusicStyle;

interface Draft extends TrackFields {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'error';
  error: string | null;
}

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac';

function fieldsOf(track: MusicTrack): TrackFields {
  return {
    title: track.title,
    artist: track.artist ?? '',
    source_url: track.source_url ?? '',
    license: track.license ?? '',
    style: track.style ?? '',
  };
}

/** Empty strings become null so the server stores "no value". */
function payloadOf(fields: TrackFields) {
  return {
    title: fields.title.trim(),
    artist: fields.artist.trim() || null,
    source_url: fields.source_url.trim() || null,
    license: fields.license.trim() || null,
    style: fields.style || null,
  };
}

function TrackForm({ value, onChange }: { value: TrackFields; onChange: (patch: Partial<TrackFields>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Título" value={value.title} onChange={(title) => onChange({ title })} />
      <TextField label="Artista" value={value.artist} onChange={(artist) => onChange({ artist })} placeholder="Ej. Kulakovka" />
      <TextField label="Página de origen" type="url" value={value.source_url} onChange={(source_url) => onChange({ source_url })} placeholder="https://…" />
      <TextField label="Licencia" value={value.license} onChange={(license) => onChange({ license })} placeholder="Ej. Pixabay Content License" />
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">Estilo</span>
        <select value={value.style} onChange={(e) => onChange({ style: toMusicStyle(e.target.value) ?? '' })} className={fieldClass}>
          <option value="">Sin estilo</option>
          {MUSIC_STYLES.map((s) => (
            <option key={s} value={s}>
              {MUSIC_STYLE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function matchesFilter(track: MusicTrack, filter: ListFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return !track.style;
  return track.style === filter;
}

/**
 * Música: one shuffled playlist for the player. Upload, edit the credits and the style,
 * enable/disable, delete; "Ver" narrows the list to one style (or the tracks without one).
 */
export function MusicView({
  notify,
  handleError,
}: {
  notify: (message: BannerMessage | null) => void;
  handleError: (err: unknown, fallback: string) => string | null;
}) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<TrackFields | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    studioJson<{ tracks: MusicTrack[] }>('/api/admin/music')
      .then(({ tracks: loaded }) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const text = handleError(err, 'No se pudo cargar la música');
          if (text) notify({ kind: 'error', text });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleError, notify]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addFiles = (files: FileList) => {
    const audio = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));
    if (audio.length === 0) {
      notify({ kind: 'error', text: 'Elige archivos de audio (.mp3, .m4a, .wav…).' });
      return;
    }
    notify(null);
    setDrafts((prev) => [
      ...prev,
      ...audio.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        title: titleFromFilename(file.name),
        artist: '',
        source_url: '',
        license: '',
        style: '' as const,
        status: 'pending' as const,
        error: null,
      })),
    ]);
  };

  const uploadDraft = (draft: Draft) => {
    if (!draft.title.trim()) {
      updateDraft(draft.id, { status: 'error', error: 'Ponle un título.' });
      return;
    }
    updateDraft(draft.id, { status: 'uploading', error: null });
    chain.current = chain.current.then(async () => {
      try {
        const { track } = await uploadFile<{ track: MusicTrack }>('/api/admin/music', draft.file, payloadOf(draft));
        setTracks((prev) => [track, ...prev]);
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      } catch (err: unknown) {
        updateDraft(draft.id, { status: 'error', error: handleError(err, 'No se pudo subir la pista') });
      }
    });
  };

  const toggle = (track: MusicTrack) => {
    if (openId === track.id) {
      setOpenId(null);
      setForm(null);
    } else {
      setOpenId(track.id);
      setForm(fieldsOf(track));
    }
    setConfirmDeleteId(null);
  };

  const patchTrack = async (id: string, patch: Record<string, unknown>, done?: string) => {
    setBusyId(id);
    try {
      const { track } = await studioJson<{ track: MusicTrack }>(`/api/admin/music/${encodeURIComponent(id)}`, jsonBody('PATCH', patch));
      setTracks((prev) => prev.map((t) => (t.id === id ? track : t)));
      if (done) notify({ kind: 'success', text: done });
      return true;
    } catch (err: unknown) {
      const text = handleError(err, 'No se pudo guardar la pista');
      if (text) notify({ kind: 'error', text });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const deleteTrack = async (track: MusicTrack) => {
    setBusyId(track.id);
    try {
      await studioJson(`/api/admin/music/${encodeURIComponent(track.id)}`, { method: 'DELETE' });
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setOpenId(null);
      notify({ kind: 'success', text: `«${track.title}» borrada.` });
    } catch (err: unknown) {
      const text = handleError(err, 'No se pudo borrar la pista');
      if (text) notify({ kind: 'error', text });
    } finally {
      setBusyId(null);
    }
  };

  const enabledCount = tracks.filter((t) => t.enabled).length;
  const totalSeconds = tracks.filter((t) => t.enabled).reduce((sum, t) => sum + t.duration_seconds, 0);
  const countOf = (f: ListFilter) => tracks.filter((t) => matchesFilter(t, f)).length;
  const shown = tracks.filter((t) => matchesFilter(t, filter));

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={AUDIO_ACCEPT}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Música</h1>
          <p className="mt-1 text-[16px] text-ink/55">
            {loading ? 'Cargando…' : `${enabledCount} en la lista · ${formatDuration(totalSeconds)} · suena en aleatorio`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex h-14 items-center gap-2 rounded-full bg-ink pl-5 pr-6 text-lg font-semibold text-white active:scale-[0.98] ${FOCUS}`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> Subir pistas
        </button>
      </div>

      {drafts.length > 0 && (
        <section aria-label="Pistas por subir" className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Por subir</h2>
          {drafts.map((draft) => (
            <div key={draft.id} className="flex flex-col gap-4 rounded-2xl border border-dashed border-ink/25 p-4">
              <p className="flex items-center gap-2 text-[14px] text-ink/55">
                <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{draft.file.name}</span>
                <span className="shrink-0">· {formatBytes(draft.file.size)}</span>
              </p>
              <TrackForm value={draft} onChange={(patch) => updateDraft(draft.id, patch)} />
              {draft.error && <p role="alert" className="text-[14px] font-medium text-heat">{draft.error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={draft.status === 'uploading'}
                  onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                  className={`h-11 rounded-full px-4 text-[15px] font-medium text-ink/60 disabled:opacity-40 ${FOCUS}`}
                >
                  Quitar
                </button>
                <button
                  type="button"
                  disabled={draft.status === 'uploading'}
                  onClick={() => uploadDraft(draft)}
                  className={`flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                >
                  {draft.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {draft.status === 'uploading' ? 'Subiendo…' : 'Subir'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && tracks.length > 0 && (
        <label className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-ink/60">Ver</span>
          <select
            value={filter}
            onChange={(e) => {
              const value = e.target.value;
              setFilter(value === 'all' || value === 'none' ? value : (toMusicStyle(value) ?? 'all'));
            }}
            className={`${fieldClass} max-w-xs`}
          >
            <option value="all">Todas ({tracks.length})</option>
            {MUSIC_STYLES.map((s) => (
              <option key={s} value={s}>
                {MUSIC_STYLE_LABELS[s]} ({countOf(s)})
              </option>
            ))}
            <option value="none">Sin estilo ({countOf('none')})</option>
          </select>
        </label>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-ink/55">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando música…
        </p>
      ) : tracks.length === 0 ? (
        <p className="py-16 text-center text-ink/55">Aún no hay pistas. Pulsa «Subir pistas».</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-ink/55">No hay pistas en este grupo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((track) => {
            const isOpen = openId === track.id;
            return (
              <li key={track.id} className="rounded-2xl bg-white">
                <div className="flex items-center gap-2 p-2 pl-4">
                  <button
                    type="button"
                    onClick={() => toggle(track)}
                    aria-expanded={isOpen}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 text-left ${FOCUS}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[16px] font-semibold ${track.enabled ? '' : 'text-ink/40'}`}>{track.title}</span>
                      <span className="block truncate text-[13px] text-ink/55">
                        {[track.style ? MUSIC_STYLE_LABELS[track.style] : null, track.artist, formatDuration(track.duration_seconds), track.license]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={track.enabled}
                    aria-label={`«${track.title}» en la lista`}
                    disabled={busyId === track.id}
                    onClick={() => void patchTrack(track.id, { enabled: !track.enabled })}
                    className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${track.enabled ? 'bg-ink' : 'bg-white'} ${FOCUS}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-transform ${track.enabled ? 'left-1 translate-x-6 bg-white' : 'left-1 bg-ink'}`}
                    />
                  </button>
                </div>

                {isOpen && form && (
                  <div className="flex flex-col gap-4 border-t border-ink/10 p-4">
                    <audio src={track.audio_url} controls preload="none" className="w-full" />
                    <TrackForm value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
                    {track.source_url && (
                      <a href={track.source_url} target="_blank" rel="noreferrer noopener" className="truncate text-[14px] text-ink/60 underline underline-offset-2">
                        {track.source_url}
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      {confirmDeleteId === track.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId === track.id}
                            onClick={() => void deleteTrack(track)}
                            className={`h-11 rounded-full bg-heat px-4 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                          >
                            Borrar para siempre
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className={`h-11 rounded-full px-3 text-[15px] font-medium text-ink/60 ${FOCUS}`}>
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(track.id)}
                          className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === track.id || !form.title.trim()}
                        onClick={async () => {
                          if (await patchTrack(track.id, payloadOf(form), 'Pista guardada.')) {
                            setOpenId(null);
                            setForm(null);
                          }
                        }}
                        className={`flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                      >
                        {busyId === track.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

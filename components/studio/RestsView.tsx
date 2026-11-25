'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Film, Loader2, Plus, Trash2 } from 'lucide-react';
import { playbackUrl } from '@/lib/media';
import type { RestVideo } from '@/types/catalog';
import { FOCUS, Poster, TextField, type BannerMessage } from '@/components/studio/StudioUi';
import {
  formatBytes,
  formatDuration,
  jsonBody,
  studioJson,
  titleFromFilename,
  uploadFile,
} from '@/components/studio/studioClient';

type DraftStatus = 'pending' | 'waiting' | 'compressing' | 'uploading' | 'error';

interface Draft {
  id: string;
  file: File;
  title: string;
  status: DraftStatus;
  error: string | null;
}

const STATUS_LABEL: Record<Exclude<DraftStatus, 'pending' | 'error'>, string> = {
  waiting: 'En cola…',
  compressing: 'Comprimiendo…',
  uploading: 'Subiendo…',
};

const VIDEO_ACCEPT = 'video/quicktime,video/mp4,video/*,.mov,.mp4,.m4v';

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
}

/**
 * Descansos: Marcel resting on camera, no voice. The app loops one, muted, in long rests.
 * Upload (one after another), rename, enable/disable, delete.
 */
export function RestsView({
  notify,
  handleError,
}: {
  notify: (message: BannerMessage | null) => void;
  handleError: (err: unknown, fallback: string) => string | null;
}) {
  const [rests, setRests] = useState<RestVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    studioJson<{ rests: RestVideo[] }>('/api/admin/rests')
      .then(({ rests: loaded }) => {
        if (!cancelled) setRests(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const text = handleError(err, 'No se pudieron cargar los descansos');
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
    const videos = Array.from(files).filter(isVideoFile);
    if (videos.length === 0) {
      notify({ kind: 'error', text: 'Elige archivos de vídeo (.MOV o .MP4).' });
      return;
    }
    notify(null);
    setDrafts((prev) => [
      ...prev,
      ...videos.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        title: titleFromFilename(file.name),
        status: 'pending' as const,
        error: null,
      })),
    ]);
  };

  const uploadDraft = (draft: Draft) => {
    const title = draft.title.trim() || titleFromFilename(draft.file.name);
    updateDraft(draft.id, { status: 'waiting', error: null });
    chain.current = chain.current.then(async () => {
      updateDraft(draft.id, { status: 'compressing' });
      try {
        const { rest } = await uploadFile<{ rest: RestVideo }>('/api/admin/rests', draft.file, { title }, (event) => {
          if (event.phase === 'uploading') updateDraft(draft.id, { status: 'uploading' });
        });
        setRests((prev) => [rest, ...prev]);
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      } catch (err: unknown) {
        updateDraft(draft.id, { status: 'error', error: handleError(err, 'No se pudo subir el vídeo') });
      }
    });
  };

  const toggle = (rest: RestVideo) => {
    if (openId === rest.id) {
      setOpenId(null);
    } else {
      setOpenId(rest.id);
      setTitleDraft(rest.title);
    }
    setConfirmDeleteId(null);
  };

  const patchRest = async (id: string, patch: { title?: string; enabled?: boolean }, done?: string) => {
    setBusyId(id);
    try {
      const { rest } = await studioJson<{ rest: RestVideo }>(`/api/admin/rests/${encodeURIComponent(id)}`, jsonBody('PATCH', patch));
      setRests((prev) => prev.map((r) => (r.id === id ? rest : r)));
      if (done) notify({ kind: 'success', text: done });
      return true;
    } catch (err: unknown) {
      const text = handleError(err, 'No se pudo guardar el vídeo');
      if (text) notify({ kind: 'error', text });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const deleteRest = async (rest: RestVideo) => {
    setBusyId(rest.id);
    try {
      const result = await studioJson<{ storageRemoved?: boolean }>(`/api/admin/rests/${encodeURIComponent(rest.id)}`, { method: 'DELETE' });
      setRests((prev) => prev.filter((r) => r.id !== rest.id));
      setOpenId(null);
      notify({
        kind: 'success',
        text: result.storageRemoved === false
          ? `«${rest.title}» borrado del catálogo; algún archivo no se pudo borrar del almacenamiento.`
          : `«${rest.title}» borrado.`,
      });
    } catch (err: unknown) {
      const text = handleError(err, 'No se pudo borrar el vídeo');
      if (text) notify({ kind: 'error', text });
    } finally {
      setBusyId(null);
    }
  };

  const enabledCount = rests.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Descansos</h1>
          <p className="mt-1 text-[16px] text-ink/55">
            {loading ? 'Cargando…' : `${enabledCount} de ${rests.length} en uso · se ven en bucle y sin sonido`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex h-14 items-center gap-2 rounded-full bg-ink pl-5 pr-6 text-lg font-semibold text-white active:scale-[0.98] ${FOCUS}`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> Subir vídeos
        </button>
      </div>

      {drafts.length > 0 && (
        <section aria-label="Vídeos por subir" className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Por subir</h2>
          {drafts.map((draft) => {
            const busy = draft.status !== 'pending' && draft.status !== 'error';
            return (
              <div key={draft.id} className="flex flex-col gap-4 rounded-2xl border border-dashed border-ink/25 p-4">
                <p className="flex items-center gap-2 text-[14px] text-ink/55">
                  <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{draft.file.name}</span>
                  <span className="shrink-0">· {formatBytes(draft.file.size)}</span>
                </p>
                <TextField
                  label="Título (opcional)"
                  value={draft.title}
                  onChange={(title) => updateDraft(draft.id, { title })}
                  placeholder={titleFromFilename(draft.file.name)}
                />
                {draft.error && <p role="alert" className="text-[14px] font-medium text-heat">{draft.error}</p>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                    className={`h-11 rounded-full px-4 text-[15px] font-medium text-ink/60 disabled:opacity-40 ${FOCUS}`}
                  >
                    Quitar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => uploadDraft(draft)}
                    className={`flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {busy ? STATUS_LABEL[draft.status as keyof typeof STATUS_LABEL] : 'Subir'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-16 text-ink/55">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Cargando descansos…
        </p>
      ) : rests.length === 0 ? (
        <p className="py-16 text-center text-ink/55">
          Tú descansando a cámara, sin voz: la app los pone en bucle y en silencio en los descansos largos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rests.map((rest) => {
            const isOpen = openId === rest.id;
            return (
              <li key={rest.id} className="rounded-2xl bg-white">
                <div className="flex items-center gap-2 p-2 pr-3">
                  <button
                    type="button"
                    onClick={() => toggle(rest)}
                    aria-expanded={isOpen}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left ${FOCUS}`}
                  >
                    <Poster src={rest.poster_url} className={`aspect-[4/5] w-12 shrink-0 rounded-lg ${rest.enabled ? '' : 'opacity-40'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[16px] font-semibold ${rest.enabled ? '' : 'text-ink/40'}`}>{rest.title}</span>
                      <span className="block truncate text-[13px] text-ink/55">{formatDuration(rest.duration_seconds)}</span>
                    </span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rest.enabled}
                    aria-label={`«${rest.title}» en uso`}
                    disabled={busyId === rest.id}
                    onClick={() => void patchRest(rest.id, { enabled: !rest.enabled })}
                    className={`relative h-8 w-14 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${rest.enabled ? 'bg-ink' : 'bg-white'} ${FOCUS}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-transform ${rest.enabled ? 'left-1 translate-x-6 bg-white' : 'left-1 bg-ink'}`}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-ink/10 p-4">
                    {/* Mounted only when opened: the list never downloads a video. */}
                    <video
                      src={playbackUrl(rest)}
                      poster={rest.poster_url ?? undefined}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="mx-auto max-h-[50dvh] w-full rounded-xl bg-black object-contain"
                    />
                    <TextField label="Título" value={titleDraft} onChange={setTitleDraft} />
                    <div className="flex items-center justify-between gap-2">
                      {confirmDeleteId === rest.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId === rest.id}
                            onClick={() => void deleteRest(rest)}
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
                          onClick={() => setConfirmDeleteId(rest.id)}
                          className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-ink/60 hover:text-heat ${FOCUS}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Borrar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === rest.id || !titleDraft.trim() || titleDraft.trim() === rest.title}
                        onClick={async () => {
                          if (await patchRest(rest.id, { title: titleDraft.trim() }, 'Título guardado.')) setOpenId(null);
                        }}
                        className={`flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                      >
                        {busyId === rest.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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

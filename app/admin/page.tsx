'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ellipsis, Loader2 } from 'lucide-react';
import type { StudioExercise } from '@/types/studio';
import { LibraryView } from '@/components/studio/LibraryView';
import { TalksView } from '@/components/studio/TalksView';
import { MusicView } from '@/components/studio/MusicView';
import { ClipsView } from '@/components/studio/ClipsView';
import { Banner, FOCUS, type BannerMessage } from '@/components/studio/StudioUi';
import { StudioAuthError, studioJson } from '@/components/studio/studioClient';

type View = 'videos' | 'hablados' | 'musica' | 'clips';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'videos', label: 'Vídeos' },
  { id: 'hablados', label: 'Vídeos hablados' },
  { id: 'musica', label: 'Música' },
  { id: 'clips', label: 'Clips' },
];

/** The open view lives in the URL hash (#hablados, #musica, #clips): reload and the back button keep it. */
function useHashView(): View {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => {
      const hash = window.location.hash.replace('#', '');
      return hash === 'hablados' || hash === 'musica' || hash === 'clips' ? hash : 'videos';
    },
    () => 'videos',
  );
}

export default function AdminStudioPage() {
  const router = useRouter();
  const view = useHashView();
  const [exercises, setExercises] = useState<StudioExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<'bunny' | 'local' | null>(null);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [talksOpenId, setTalksOpenId] = useState<string | null>(null);

  /** The message to show for an error; null when the session expired (already redirecting). */
  const handleError = useCallback(
    (err: unknown, fallback: string): string | null => {
      if (err instanceof StudioAuthError) {
        router.replace('/studio-login');
        return null;
      }
      return err instanceof Error ? err.message : fallback;
    },
    [router],
  );

  const loadExercises = useCallback(async () => {
    try {
      const data = await studioJson<{ exercises: StudioExercise[]; driver: 'bunny' | 'local' }>('/api/admin/exercises');
      setExercises(data.exercises.map((e) => ({ ...e, talks: e.talks ?? [] })));
      setDriver(data.driver);
    } catch (err: unknown) {
      const text = handleError(err, 'Error al cargar la biblioteca');
      if (text) setBanner({ kind: 'error', text });
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    // Initial load of the library (text and poster URLs only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExercises();
  }, [loadExercises]);

  const goTo = (next: View) => {
    setBanner(null);
    // A new history entry (not replace): the phone's back button returns to the previous view.
    window.location.assign(next === 'videos' ? '#' : `#${next}`);
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    setBanner(null);
    try {
      const data = await studioJson<{ total: number; updated: number; failed: number }>(
        '/api/admin/recalculate-durations',
        { method: 'POST' },
      );
      setBanner({
        kind: 'success',
        text: `Duraciones verificadas con ffprobe: ${data.updated} actualizadas de ${data.total} vídeos (${data.failed} errores).`,
      });
      await loadExercises();
    } catch (err: unknown) {
      const text = handleError(err, 'Error al recalcular duraciones');
      if (text) setBanner({ kind: 'error', text });
    } finally {
      setRecalculating(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => {});
    router.replace('/studio-login');
  };

  return (
    <main className="min-h-dvh bg-paper font-[family-name:var(--font-display)] text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
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
                onClick={() => void handleRecalculate()}
                disabled={recalculating}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left hover:bg-ink/6 disabled:opacity-50 ${FOCUS}`}
              >
                {recalculating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {recalculating ? 'Recalculando…' : 'Recalcular duraciones'}
              </button>
              <button type="button" onClick={() => void handleLogout()} className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-ink/6 ${FOCUS}`}>
                Cerrar sesión
              </button>
            </div>
          </details>
        </header>

        <nav aria-label="Secciones del Estudio" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1 rounded-full bg-ink/6 p-1">
            {VIEWS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goTo(item.id)}
                  aria-current={view === item.id ? 'page' : undefined}
                  className={`h-10 whitespace-nowrap rounded-full px-4 text-[15px] font-semibold ${
                    view === item.id ? 'bg-white text-ink shadow-sm' : 'text-ink/55 hover:text-ink'
                  } ${FOCUS}`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {driver === 'local' && (
          <p className="text-[13px] text-ink/50">
            Modo local: sin Bunny configurado, los archivos se guardan en la carpeta .media de este ordenador.
          </p>
        )}

        {banner && <Banner message={banner} onClose={() => setBanner(null)} />}

        {/* All views stay mounted (only hidden), so uploads in progress keep their state. */}
        <div hidden={view !== 'videos'}>
          <LibraryView
            exercises={exercises}
            loading={loading}
            setExercises={setExercises}
            notify={setBanner}
            handleError={handleError}
            onManageTalks={(id) => {
              setTalksOpenId(id);
              goTo('hablados');
            }}
          />
        </div>
        <div hidden={view !== 'hablados'}>
          <TalksView
            exercises={exercises}
            loading={loading}
            setExercises={setExercises}
            notify={setBanner}
            handleError={handleError}
            openId={view === 'hablados' ? talksOpenId : null}
            setOpenId={setTalksOpenId}
          />
        </div>
        <div hidden={view !== 'musica'}>
          <MusicView notify={setBanner} handleError={handleError} />
        </div>
        <div hidden={view !== 'clips'}>
          <ClipsView exercises={exercises} notify={setBanner} handleError={handleError} />
        </div>
      </div>
    </main>
  );
}

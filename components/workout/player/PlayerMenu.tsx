'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import type { MusicStyle } from '@/types/catalog';
import { MUSIC_STYLE_LABELS, toMusicStyle } from '@/lib/musicStyles';

/*
 * The only control at the top: "···". Inside: the beep of the last 3 s, music (mute, volume and,
 * once some tracks have a style, which style plays), "Crear clip" when the Studio is on, and Salir.
 */

const ITEM_FOCUS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink';

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-ink/20'}`}>
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${on ? 'translate-x-4' : ''}`}
      />
    </span>
  );
}

export function PlayerMenu({
  beepOn,
  onToggleBeep,
  musicAvailable,
  musicOn,
  onToggleMusic,
  musicVolume,
  onMusicVolume,
  musicStyles,
  musicStyle,
  onMusicStyle,
  onCreateClip,
  onExit,
}: {
  beepOn: boolean;
  onToggleBeep: () => void;
  musicAvailable: boolean; // false: the catalogue has no tracks yet
  musicOn: boolean;
  onToggleMusic: () => void;
  musicVolume: number; // 0..1
  onMusicVolume: (volume: number) => void;
  musicStyles: MusicStyle[]; // styles with enabled tracks; [] hides the choice
  musicStyle: MusicStyle | null; // the one that plays; null = «Todas»
  onMusicStyle: (style: MusicStyle | null) => void;
  onCreateClip?: () => void;
  onExit: () => void;
}) {
  const musicNoteId = useId();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const row = `flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors duration-150 hover:bg-ink/8 disabled:cursor-default ${ITEM_FOCUS}`;

  return (
    <div
      ref={root}
      className="fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 font-[family-name:var(--font-display)] lg:right-8 lg:top-6"
    >
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Más opciones"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[rgb(14_14_14/0.6)] text-white transition-colors duration-150 hover:bg-[rgb(44_44_44/0.86)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Ellipsis className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full mt-2 w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl bg-white p-1.5 text-[15px] font-medium text-ink shadow-[0_24px_60px_-18px_rgba(0,0,0,0.45)]"
        >
          <button type="button" role="switch" aria-checked={beepOn} onClick={onToggleBeep} className={row}>
            Pitido en los últimos 3 s
            <Switch on={beepOn} />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={musicAvailable && musicOn}
            aria-describedby={musicAvailable ? undefined : musicNoteId}
            disabled={!musicAvailable}
            onClick={onToggleMusic}
            className={`${row} disabled:opacity-45 disabled:hover:bg-transparent`}
          >
            Música
            <Switch on={musicAvailable && musicOn} />
          </button>
          {!musicAvailable && (
            <p id={musicNoteId} className="px-3 pb-1 text-[13px] leading-snug text-ink/70">
              Aún no hay canciones.
            </p>
          )}
          <label className={`flex min-h-11 items-center gap-3 px-3 ${musicAvailable && musicOn ? '' : 'opacity-45'}`}>
            <span className="text-[13px] text-ink/70">Volumen</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              disabled={!musicAvailable || !musicOn}
              onChange={(e) => onMusicVolume(Number(e.target.value))}
              aria-label="Volumen de la música"
              className="h-11 min-w-0 flex-1 cursor-pointer accent-ink disabled:cursor-default"
            />
          </label>
          {musicAvailable && musicStyles.length > 0 && (
            <label className={`flex min-h-11 items-center gap-3 px-3 ${musicOn ? '' : 'opacity-45'}`}>
              <span className="text-[13px] text-ink/70">Estilo</span>
              <select
                value={musicStyle ?? ''}
                disabled={!musicOn}
                onChange={(e) => onMusicStyle(toMusicStyle(e.target.value))}
                aria-label="Estilo de la música"
                className={`h-9 min-w-0 flex-1 cursor-pointer rounded-lg bg-ink/6 px-2 text-[15px] font-medium text-ink disabled:cursor-default ${ITEM_FOCUS}`}
              >
                <option value="">Todas</option>
                {musicStyles.map((s) => (
                  <option key={s} value={s}>
                    {MUSIC_STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onCreateClip && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateClip();
              }}
              className={row}
            >
              Crear clip
            </button>
          )}
          <div className="mx-3 my-1 h-px bg-ink/10" />
          <button type="button" onClick={onExit} className={row}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}

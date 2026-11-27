'use client';

import { useSyncExternalStore } from 'react';
import { formatLogTime, getAudioLog, isAudioDebug, subscribeAudioLog } from '@/lib/audio/audioLog';
import { getMusicEngine } from '@/lib/audio/music';
import { talkDebugState } from '@/lib/audio/talkVideo';

/*
 * The player's audio debug overlay, only with `?audiodebug=1` in the URL (otherwise nothing is
 * rendered and nothing listens): the AudioContext, the music element and its gain, the talk
 * element and how its voice is routed, and the last audio events. Small monospace text in a
 * corner, for a screenshot from the phone. It lets every tap through.
 */

const REFRESH_MS = 250;
const noSubscribe = () => () => {};

function yesNo(v: boolean): string {
  return v ? 'sí' : 'no';
}

function readText(): string {
  const engine = getMusicEngine();
  const lines: string[] = [];
  if (engine) {
    const s = engine.debugState();
    const deck = s.decks?.[s.live];
    lines.push(`ctx ${s.contextState ?? '—'} · música ${s.route} · gain ${s.gain === null ? '—' : s.gain.toFixed(2)}`);
    lines.push(
      deck
        ? `música ${deck.paused ? 'PAUSED' : 'playing'} t=${deck.time.toFixed(1)} rs=${deck.readyState} pista=${deck.track ?? '—'}`
        : 'música sin elementos (falta el toque)',
    );
    lines.push(
      `deseada ${yesNo(s.wanted)} · baja ${yesNo(s.ducked)} · pausa ${yesNo(s.paused)} · oculta ${yesNo(s.hidden)} · vigía ${s.watchAttempts} · toque ${yesNo(s.needsTap)}`,
    );
  }
  const talk = talkDebugState();
  lines.push(
    talk
      ? `voz ${talk.route} · ${talk.paused ? 'paused' : 'playing'}${talk.muted ? ' MUDA' : ''} t=${talk.time.toFixed(1)} rs=${talk.readyState}${talk.hasSrc ? '' : ' sin src'} · baja música ${yesNo(talk.ducks)}`
      : 'voz: sin elemento',
  );
  lines.push('— eventos —');
  for (const entry of getAudioLog()) lines.push(`${formatLogTime(entry.at)} ${entry.text}`);
  return lines.join('\n');
}

let text = '';

function subscribeText(onChange: () => void): () => void {
  text = readText();
  const refresh = () => {
    const next = readText();
    if (next === text) return;
    text = next;
    onChange();
  };
  const timer = setInterval(refresh, REFRESH_MS);
  const off = subscribeAudioLog(refresh);
  return () => {
    clearInterval(timer);
    off();
  };
}

const getText = () => text;
const getServerText = () => '';

function AudioDebugPanel() {
  const shown = useSyncExternalStore(subscribeText, getText, getServerText);
  return (
    <pre
      aria-hidden="true"
      className="pointer-events-none fixed left-[max(0.5rem,env(safe-area-inset-left))] top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] lg:top-20 z-[100] m-0 max-w-[calc(100vw-1rem)] whitespace-pre-wrap break-words rounded-md bg-black/80 p-2 font-mono text-[10.5px] leading-[1.3] text-[#9ef59e]"
    >
      {shown}
    </pre>
  );
}

export function AudioDebug() {
  const enabled = useSyncExternalStore(noSubscribe, isAudioDebug, () => false);
  return enabled ? <AudioDebugPanel /> : null;
}

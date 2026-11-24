import type { MusicTrack } from '@/types/catalog';

/*
 * Development only: three short synthetic "songs" for /preview/player, made in the browser from
 * sine waves and noise (no files, nothing downloaded). Each one has its own rhythm so a track
 * change and the ducking under a talk are easy to hear. Served as same-origin blob: URLs, the
 * same path through Web Audio as the real tracks.
 */

const RATE = 22050;

type Voice = (t: number) => number;

function pulse(t: number, bpm: number, decay: number): number {
  const beat = 60 / bpm;
  const phase = t % beat;
  return Math.exp(-phase * decay);
}

let noiseSeed = 1;
function noise(): number {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
  return noiseSeed / 2 ** 31 - 1;
}

const VOICES: { id: string; title: string; seconds: number; voice: Voice }[] = [
  {
    id: 'dev-tone-a',
    title: 'Tono A (prueba)',
    seconds: 14,
    // a steady chord pulsing at 110 bpm
    voice: (t) =>
      pulse(t, 110, 6) * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277.2 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t)) * 0.25,
  },
  {
    id: 'dev-tone-b',
    title: 'Tono B (prueba)',
    seconds: 12,
    // low bass on the beat and noise hats in between
    voice: (t) => {
      const kick = pulse(t, 124, 9) * Math.sin(2 * Math.PI * (55 + 60 * pulse(t, 124, 30)) * t);
      const hat = pulse(t + 60 / 248, 248, 40) * noise() * 0.25;
      return (kick * 0.6 + hat) * 0.7;
    },
  },
  {
    id: 'dev-tone-c',
    title: 'Tono C (prueba)',
    seconds: 10,
    // a rising arpeggio, four notes per beat
    voice: (t) => {
      const notes = [262, 330, 392, 523];
      const step = Math.floor(t / 0.13) % notes.length;
      return pulse(t, 60 / 0.13, 8) * Math.sin(2 * Math.PI * notes[step] * t) * 0.35;
    },
  },
];

function wav(seconds: number, voice: Voice): Blob {
  const frames = Math.round(seconds * RATE);
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.05); // no clicks at the ends
    const sample = Math.max(-1, Math.min(1, voice(t) * fade));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

let made: MusicTrack[] | null = null;

/** The fixture playlist (made once per page). */
export function fixtureMusic(): MusicTrack[] {
  made ??= VOICES.map(({ id, title, seconds, voice }) => ({
    id,
    title,
    artist: null,
    source_url: null,
    license: 'Sintetizada para pruebas',
    audio_url: URL.createObjectURL(wav(seconds, voice)),
    duration_seconds: seconds,
    enabled: true,
  }));
  return made;
}

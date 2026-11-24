import 'server-only';
import sharp from 'sharp';
import { W, H } from '@/lib/server/clips/run';

/*
 * Text on the videos. FFmpeg builds without drawtext are common (Homebrew), so every caption is
 * drawn as an SVG, turned into a PNG by sharp, and FFmpeg only lays images over the video.
 * Captions stay inside TikTok's safe zone: x 108-900, y 240-1260 (see docs/TIKTOK-PLAYBOOK.md).
 */

export const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
// TikTok covers the left/right 120 px, the bottom 660 px and a column on the right: keep words inside.
export const L = 108;
export const C = { paper: '#e9e9e7', ink: '#131313', heat: '#ff3b30', warm: '#ff9f0a', rest: '#2f6bff' };

export type Tone = 'warm' | 'work' | 'rest';
export const TONE_FILL: Record<Tone, string> = { warm: C.warm, work: C.heat, rest: C.rest };
export const TONE_TEXT: Record<Tone, string> = { warm: C.ink, work: '#ffffff', rest: '#ffffff' };

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Greedy word wrap by character count (Helvetica bold ≈ 0.56 em per character). */
export function wrap(value: string, maxChars: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

export const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

export const full = (body: string) => svg(W, H, body);

export const text = (
  x: number,
  y: number,
  value: string,
  size: number,
  fill: string,
  opts: { weight?: number; anchor?: 'start' | 'middle' | 'end'; spacing?: number; opacity?: number } = {},
) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${opts.weight ?? 700}" fill="${fill}"${
    opts.opacity !== undefined ? ` fill-opacity="${opts.opacity}"` : ''
  } text-anchor="${opts.anchor ?? 'start'}"${opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''}>${esc(value)}</text>`;

/** A filled label: "CALENTAMIENTO", "PARTE PRINCIPAL"… Width estimated from the text length. */
export const pill = (x: number, y: number, label: string, bg: string, fg: string, size = 32) => {
  const w = Math.round(label.length * size * 0.7 + size * 1.6);
  const h = Math.round(size * 2);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/>${text(
    x + w / 2,
    y + h / 2 + size * 0.36,
    label,
    size,
    fg,
    { weight: 800, anchor: 'middle', spacing: 2 },
  )}`;
};

const PNG_TIMEOUT_MS = 60_000;

/** One overlay image. Never waits forever: a stuck render must fail and free the queue. */
export async function png(markup: string, file: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sharp(Buffer.from(markup)).png({ compressionLevel: 3 }).toFile(file),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Se atascó al dibujar los textos del vídeo. Prueba otra versión.')), PNG_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Write many PNGs, a dozen at a time (sharp is fast, but not with 1800 frames in flight). */
export async function pngSequence(count: number, frame: (i: number) => string, file: (i: number) => string): Promise<void> {
  for (let i = 0; i < count; i += 12) {
    await Promise.all(
      Array.from({ length: Math.min(12, count - i) }, (_, k) => png(frame(i + k), file(i + k))),
    );
  }
}

export const frameName = (i: number) => `${String(i).padStart(4, '0')}.png`;

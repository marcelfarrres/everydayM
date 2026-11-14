import 'server-only';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { REST_LINES, cheerFor, getItemDuration } from '@/lib/routine';
import type { Exercise, RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * TikTok export: real MP4s (1080×1920, 30 fps, no audio) built from the routine's own clips.
 *
 * ffmpeg here cannot draw text (Homebrew builds ship without drawtext), so every caption is
 * drawn as an SVG, turned into a PNG by sharp, and ffmpeg only lays images over the video.
 * Each part of the routine is encoded on its own (same settings), then all parts are joined
 * without re-encoding. Captions stay inside TikTok's safe zone: x 64-900, y 240-1530.
 */

const execFileAsync = promisify(execFile);
const W = 1080;
const H = 1920;
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const C = { paper: '#e9e9e7', ink: '#131313', heat: '#ff3b30', warm: '#ff9f0a', rest: '#2f6bff' };
// Runtime temp paths: tell the bundler not to trace them (it would ship the whole project).
const join = (...parts: string[]) => path.join(/* turbopackIgnore: true */ ...parts);

export type ExportMode = 'summary' | 'full';
export interface ExportJob {
  status: 'running' | 'done' | 'error';
  progress: number; // 0..1
  step: string;
  error?: string;
  file?: string;
}

type Ctx = {
  dir: string;
  clips: Map<string, string>; // video url → local file
  encoder: string[];
  handle: string;
  meta: RoutineMeta;
  queue: RoutineItem[];
  prompt: string;
};
type Part = { name: string; render: (ctx: Ctx, out: string) => Promise<void> };

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Greedy word wrap by character count (Helvetica bold ≈ 0.56 em per character). */
function wrap(text: string, maxChars: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
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

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const text = (
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
const pill = (x: number, y: number, label: string, bg: string, fg: string, size = 32) => {
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

async function png(markup: string, file: string) {
  await sharp(Buffer.from(markup)).png({ compressionLevel: 3 }).toFile(file);
}

async function ff(args: string[]) {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

let encoderCheck: Promise<boolean> | null = null;
/** Apple's hardware encoder when there is one (≈10× faster), otherwise x264. */
async function pickEncoder(mode: ExportMode): Promise<string[]> {
  encoderCheck ??= execFileAsync('ffmpeg', ['-hide_banner', '-encoders'], { windowsHide: true })
    .then(({ stdout }) => /h264_videotoolbox/.test(stdout))
    .catch(() => false);
  // ~2.4 MB/min for the full routine (a 30 min video ≈ 700 MB), crisper for the 15 s teaser.
  const [rate, crf] = mode === 'summary' ? ['6M', '20'] : ['3200k', '24'];
  return (await encoderCheck)
    ? ['-c:v', 'h264_videotoolbox', '-b:v', rate, '-profile:v', 'high']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf];
}

/** Same settings for every part, so the parts can be joined without re-encoding. */
const outArgs = (ctx: Ctx, seconds: number, out: string) => [
  '-t',
  seconds.toFixed(3),
  '-r',
  '30',
  '-pix_fmt',
  'yuv420p',
  ...ctx.encoder,
  '-an',
  out,
];

const COVER = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30`;

/* ── words ────────────────────────────────────────────────────────────────── */

type Tone = 'warm' | 'work' | 'rest';
const TONE_FILL: Record<Tone, string> = { warm: C.warm, work: C.heat, rest: C.rest };
const TONE_TEXT: Record<Tone, string> = { warm: C.ink, work: '#ffffff', rest: '#ffffff' };


/* ── parts ────────────────────────────────────────────────────────────────── */

function plan(meta: RoutineMeta) {
  const minutes = Math.max(1, Math.round(meta.totalSeconds / 60));
  return {
    minutes,
    shape: `${meta.rounds} ${meta.rounds === 1 ? 'ronda' : 'rondas'} × ${meta.exercisesPerRound} ejercicios`,
  };
}

/** The day's own exercises (no repeats), so every routine's video opens and closes differently. */
function dayExercises(meta: RoutineMeta): Exercise[] {
  const seen = new Set<string>();
  return meta.circuit.filter((e) => !seen.has(e.id) && seen.add(e.id));
}

/** Same routine → same words; another routine → (most likely) other words. */
function pick<T>(meta: RoutineMeta, salt: number, options: T[]): T {
  let h = salt;
  for (const ch of meta.circuit.map((e) => e.id).join('|')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

function headline(meta: RoutineMeta): string {
  const { minutes } = plan(meta);
  const focus = meta.focusLabel || 'Full body';
  const low = focus.toLowerCase();
  return pick(meta, 7, [`Hoy toca ${low}`, `${minutes} min de ${low}`, `${focus}, ${minutes} minutos`, `Rutina de ${low}`, `${focus} sin excusas`]);
}

const CTAS = ['¿Te atreves?', 'Guárdala y hazla hoy', 'Mañana, otra distinta', 'Comenta «hecha» si la acabas'];

/* ── Opening: the sentence types itself on an iPhone keyboard ───────────────── */

type Key = { x: number; y: number; w: number; label: string };
const KEY_H = 108;
const ROWS_Y = [1196, 1326, 1456, 1586];

function keyRow(chars: string[], y: number, widths?: number[]): Key[] {
  const ws = widths ?? chars.map(() => 94);
  const total = ws.reduce((a, b) => a + b, 0) + 12 * (ws.length - 1);
  let x = (W - total) / 2;
  return chars.map((label, i) => {
    const key = { x, y, w: ws[i], label };
    x += ws[i] + 12;
    return key;
  });
}

const LAYOUTS = {
  letters: [
    ...keyRow([...'qwertyuiop'], ROWS_Y[0]),
    ...keyRow([...'asdfghjklñ'], ROWS_Y[1]),
    ...keyRow(['⇧', ...'zxcvbnm', '⌫'], ROWS_Y[2], [130, 94, 94, 94, 94, 94, 94, 94, 130]),
    ...keyRow(['123', 'espacio', 'intro'], ROWS_Y[3], [150, 620, 250]),
  ],
  numbers: [
    ...keyRow([...'1234567890'], ROWS_Y[0]),
    ...keyRow([...'-/:;()€&@"'], ROWS_Y[1]),
    ...keyRow(['#+=', ...".,?!'", '⌫'], ROWS_Y[2], [130, 140, 140, 140, 140, 140, 130]),
    ...keyRow(['ABC', 'espacio', 'intro'], ROWS_Y[3], [150, 620, 250]),
  ],
};
const SPECIAL = new Set(['⇧', '⌫', '123', 'ABC', '#+=', 'intro']);

/** Which key a character comes from: "í" → i, "P" → p with shift, "3" → the numbers layout. */
function keyFor(ch: string): { layout: 'letters' | 'numbers'; label: string; shift: boolean } | null {
  if (ch === ' ') return { layout: 'letters', label: 'espacio', shift: false };
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lower = ch === 'Ñ' ? 'ñ' : base.toLowerCase();
  if (LAYOUTS.letters.some((k) => k.label === lower)) return { layout: 'letters', label: lower, shift: ch !== ch.toLowerCase() };
  if (LAYOUTS.numbers.some((k) => k.label === base)) return { layout: 'numbers', label: base, shift: false };
  return null;
}

function keyboardFrame(o: {
  typed: string;
  pressed: string | null; // the character being typed this frame
  caret: boolean;
  send: 'off' | 'ready' | 'pressed';
}): string {
  const press = o.pressed ? keyFor(o.pressed) : null;
  // iOS shows the layout of the key being used; after a digit it stays on numbers until a letter.
  const lastTyped = o.typed.slice(-1);
  const layout = press?.layout ?? (lastTyped && keyFor(lastTyped)?.layout === 'numbers' && lastTyped !== ' ' ? 'numbers' : 'letters');
  const upper = o.typed.length === 0 || (press?.shift ?? false);
  const lines = wrap(o.typed, 24, 2);
  const shown = lines.length ? lines : [''];
  const cardH = 150 + (shown.length - 1) * 74;

  const keys = LAYOUTS[layout]
    .map((k) => {
      const special = SPECIAL.has(k.label);
      const down = press && k.label === press.label && press.layout === layout;
      const shiftOn = k.label === '⇧' && (upper || press?.shift);
      const fill = down ? (special || k.label === 'espacio' ? '#ffffff' : '#ffffff') : special && !shiftOn ? '#abb0ba' : '#ffffff';
      const label = layout === 'letters' && !special && k.label !== 'espacio' && upper ? k.label.toUpperCase() : k.label;
      const size = k.label.length > 2 ? 38 : 54;
      return `<rect x="${k.x}" y="${k.y + 3}" width="${k.w}" height="${KEY_H}" rx="14" fill="#898a8d"/>
        <rect x="${k.x}" y="${k.y}" width="${k.w}" height="${KEY_H}" rx="14" fill="${down && (special || k.label === 'espacio') ? '#d6d9de' : fill}"/>
        ${text(k.x + k.w / 2, k.y + KEY_H / 2 + size * 0.36, label, size, '#000', { weight: special ? 500 : 400, anchor: 'middle' })}`;
    })
    .join('');

  // The pressed letter pops up above its key, like on an iPhone, with the touch under it.
  let pop = '';
  if (press && press.label !== 'espacio') {
    const k = LAYOUTS[layout].find((key) => key.label === press.label);
    if (k) {
      const w = k.w + 50;
      const x = Math.max(8, Math.min(W - w - 8, k.x - 25));
      const glyph = o.pressed ?? '';
      pop = `<rect x="${x}" y="${k.y - 150}" width="${w}" height="${150 + KEY_H}" rx="22" fill="#fff" filter="url(#sh)"/>
        ${text(x + w / 2, k.y - 40, glyph, 92, '#000', { weight: 400, anchor: 'middle' })}`;
    }
  }
  const touch = press
    ? (() => {
        const k = LAYOUTS[layout].find((key) => key.label === press.label);
        return k ? `<circle cx="${k.x + k.w / 2}" cy="${k.y + KEY_H / 2 + 10}" r="46" fill="#000" fill-opacity="0.12"/>` : '';
      })()
    : '';

  const sendFill = o.send === 'off' ? '#131313' : '#131313';
  const sendOpacity = o.send === 'off' ? 0.25 : 1;
  const sendR = o.send === 'pressed' ? 52 : 60;
  const sendCy = 720 + cardH / 2;
  return svg(
    W,
    H,
    `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.25"/></filter></defs>
     <rect width="${W}" height="${H}" fill="${C.paper}"/>
     ${text(64, 330, 'Everyday M', 44, C.ink, { weight: 800 })}
     ${text(64, 520, '¿Qué entrenamos', 112, C.ink, { weight: 800 })}
     ${text(64, 642, 'hoy?', 112, C.ink, { weight: 800 })}
     <rect x="40" y="720" width="${W - 80}" height="${cardH}" rx="64" fill="#fff" filter="url(#sh)"/>
     ${
       o.typed
         ? shown
             .map(
               (l, i) =>
                 `<text x="100" y="${815 + i * 74}" font-family="${FONT}" font-size="58" font-weight="500" fill="${C.ink}">${esc(l)}${
                   i === shown.length - 1 && o.caret ? '<tspan fill="#0a84ff" font-weight="300">|</tspan>' : ''
                 }</text>`,
             )
             .join('')
         : `<text x="100" y="815" font-family="${FONT}" font-size="58" font-weight="500" fill="${C.ink}" fill-opacity="0.35">${
             o.caret ? '<tspan fill="#0a84ff" fill-opacity="1" font-weight="300">|</tspan>' : ''
           }Hombros, 20 minutos</text>`
     }
     <circle cx="${W - 120}" cy="${sendCy}" r="${sendR}" fill="${sendFill}" fill-opacity="${sendOpacity}"/>
     <path d="M${W - 120} ${sendCy + 26}V${sendCy - 24}M${W - 145} ${sendCy - 1}L${W - 120} ${sendCy - 26}L${W - 95} ${sendCy - 1}" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
     <rect y="1160" width="${W}" height="${H - 1160}" fill="#d1d4d9"/>
     ${keys}${touch}${pop}`,
  );
}

function typingPart(): Part {
  return {
    name: 'typing',
    render: async (ctx, out) => {
      const phrase = ctx.prompt;
      // 20 frames a second: a beat of blinking caret, one character every 2 frames, then send.
      const lead = 8;
      const frames: { typed: string; pressed: string | null; caret: boolean; send: 'off' | 'ready' | 'pressed' }[] = [];
      for (let f = 0; f < lead; f++) frames.push({ typed: '', pressed: null, caret: f % 10 < 5, send: 'off' });
      for (let i = 0; i < phrase.length; i++) {
        frames.push({ typed: phrase.slice(0, i + 1), pressed: phrase[i], caret: true, send: 'ready' });
        frames.push({ typed: phrase.slice(0, i + 1), pressed: null, caret: true, send: 'ready' });
      }
      for (let f = 0; f < 6; f++) frames.push({ typed: phrase, pressed: null, caret: f % 10 < 5, send: 'ready' });
      for (let f = 0; f < 3; f++) frames.push({ typed: phrase, pressed: null, caret: false, send: 'pressed' });
      for (let f = 0; f < 3; f++) frames.push({ typed: phrase, pressed: null, caret: false, send: 'ready' });
      const seqDir = join(ctx.dir, 'typing');
      await fs.mkdir(seqDir);
      for (let i = 0; i < frames.length; i += 12) {
        await Promise.all(
          frames.slice(i, i + 12).map((frame, k) => png(keyboardFrame(frame), join(seqDir, `${String(i + k).padStart(4, '0')}.png`))),
        );
      }
      await ff(['-framerate', '20', '-i', join(seqDir, '%04d.png'), '-vf', 'fps=30,setsar=1', ...outArgs(ctx, frames.length / 20, out)]);
    },
  };
}

/** Marcel turns up ready for the gym (his clip), and the routine's headline lands on it. */
function marcelPart(seconds: number): Part {
  return {
    name: 'marcel',
    render: async (ctx, out) => {
      const title = wrap(headline(ctx.meta), 14);
      const overlay = join(ctx.dir, 'marcel.png');
      await png(
        svg(
          W,
          H,
          `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs>
           <rect x="0" y="${H - 900}" width="${W}" height="900" fill="url(#g)"/>
           ${title.map((l, i) => text(64, 1380 - (title.length - 1 - i) * 118, l, 112, '#fff', { weight: 800 })).join('')}
           ${text(64, 1470, ctx.handle, 36, '#fff', { weight: 700, opacity: 0.75 })}`,
        ),
        overlay,
      );
      await ff([
        '-i',
        join(process.cwd(), 'public', 'marcel-ready.mp4'),
        '-loop',
        '1',
        '-i',
        overlay,
        '-filter_complex',
        `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=${Math.max(0, seconds - 2).toFixed(2)}:d=0.5:alpha=1[o];[v][o]overlay=0:0:shortest=1[out]`,
        '-map',
        '[out]',
        ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/** The plan over a mosaic of today's exercises, all moving. */
function planPart(seconds: number): Part {
  return {
    name: 'plan',
    render: async (ctx, out) => {
      const { minutes, shape } = plan(ctx.meta);
      const day = dayExercises(ctx.meta);
      const tiles = Array.from({ length: 6 }, (_, i) => day[i % day.length]);
      const overlay = join(ctx.dir, 'plan.png');
      const warmups = ctx.meta.warmups?.length ?? 0;
      const rest = ctx.queue.find((q) => q.kind === 'rest');
      const rows = [
        warmups > 0 ? [C.warm, 'Calentamiento', `${warmups} ejercicios`] : null,
        [C.heat, 'Parte principal', shape],
        rest ? [C.rest, 'Descansos', `${Math.round(rest.kind === 'rest' ? rest.duration : 0)} s`] : null,
      ].filter((r): r is string[] => r !== null);
      const band = 300 + rows.length * 90;
      const top = (H - band) / 2;
      await png(
        svg(
          W,
          H,
          `<rect y="${top}" width="${W}" height="${band}" fill="#000" fill-opacity="0.66"/>
           ${text(64, top + 90, 'ASÍ SERÁ HOY', 36, '#fff', { weight: 800, spacing: 6, opacity: 0.75 })}
           ${text(64, top + 230, `${minutes} min`, 150, '#fff', { weight: 800 })}
           ${rows
             .map(
               ([color, label, detail], i) =>
                 `<circle cx="84" cy="${top + 300 + i * 90}" r="18" fill="${color}"/><text x="124" y="${top + 316 + i * 90}" font-family="${FONT}" font-size="50" fill="#fff"><tspan font-weight="800">${esc(label)}</tspan><tspan dx="16" font-weight="500" fill-opacity="0.75">·</tspan><tspan dx="14" font-weight="500" fill-opacity="0.75">${esc(detail)}</tspan></text>`,
             )
             .join('')}`,
        ),
        overlay,
      );
      // 2 × 3 grid with thin gaps; it zooms out slightly as it opens.
      const tw = 534;
      const th = 630;
      const pos = ['0_0', `${W - tw}_0`, `0_${645}`, `${W - tw}_645`, `0_${H - th}`, `${W - tw}_${H - th}`];
      const inputs = tiles.flatMap((ex, i) => {
        const clipSeconds = Math.max(seconds + 1, Number(ex.duration_seconds) || 30);
        return ['-ss', (clipSeconds * (0.2 + 0.1 * i)).toFixed(2), '-stream_loop', '-1', '-i', ctx.clips.get(ex.video_url)!];
      });
      const graph =
        tiles.map((_, i) => `[${i}:v]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1,fps=30[t${i}]`).join(';') +
        `;${tiles.map((_, i) => `[t${i}]`).join('')}xstack=inputs=6:layout=${pos.join('|')}:fill=black,` +
        `scale=w='trunc(${W}*(1.12-0.12*min(t/${seconds},1))/2)*2':h=-2:eval=frame,crop=${W}:${H},setsar=1[g];` +
        `[6:v]format=rgba,fade=in:st=0.25:d=0.4:alpha=1[o];[g][o]overlay=0:0[out]`;
      await ff([...inputs, '-loop', '1', '-i', overlay, '-filter_complex', graph, '-map', '[out]', ...outArgs(ctx, seconds, out)]);
    },
  };
}

/** Plan or end card over one of today's clips, blurred and dimmed so the words read. */
function endPart(seconds: number): Part {
  return {
    name: 'end',
    render: async (ctx, out) => {
      const { minutes, shape } = plan(ctx.meta);
      const day = dayExercises(ctx.meta);
      const bg = day[day.length - 1];
      const card = join(ctx.dir, 'end.png');
      const cta = wrap(pick(ctx.meta, 13, CTAS), 13, 3);
      const body =
         `${cta.map((l, i) => text(64, 760 + i * 128, l, 120, '#fff', { weight: 800 })).join('')}
             ${text(64, 760 + cta.length * 128 + 10, `${ctx.meta.focusLabel} · ${minutes} min · ${shape}`, 42, '#fff', { weight: 600, opacity: 0.85 })}
             ${pill(64, 760 + cta.length * 128 + 70, ctx.handle.toUpperCase(), C.heat, '#fff', 34)}`;
      await png(svg(W, H, body), card);
      const clipSeconds = Math.max(seconds + 1, Number(bg.duration_seconds) || 30);
      await ff([
        '-ss',
        (clipSeconds * 0.5).toFixed(2),
        '-stream_loop',
        '-1',
        '-i',
        ctx.clips.get(bg.video_url)!,
        '-loop',
        '1',
        '-i',
        card,
        '-filter_complex',
        `[0:v]${COVER},boxblur=22:2,eq=brightness=-0.22:saturation=1.15[b];[1:v]format=rgba,fade=in:st=0.1:d=0.4:alpha=1[o];[b][o]overlay=0:0[out]`,
        '-map',
        '[out]',
        ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/** Where the whole routine is: one bar per exercise (tone colour) and per rest (blue). */
function progressBar(queue: RoutineItem[], index: number, fraction: number, x: number, y: number, width: number) {
  const items = queue
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.kind === 'warmup' || item.kind === 'workout' || item.kind === 'rest');
  const durations = items.map(({ item }) => getItemDuration(item));
  const total = durations.reduce((a, b) => a + b, 0) || 1;
  const gap = 3;
  const usable = width - gap * (items.length - 1);
  let cursor = x;
  return items
    .map(({ item, i }, k) => {
      const w = Math.max(2, (durations[k] / total) * usable);
      const color = item.kind === 'rest' ? C.rest : item.kind === 'warmup' ? C.warm : C.heat;
      const fill = i < index ? 1 : i === index ? fraction : 0;
      const bar = `<rect x="${cursor.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="12" rx="6" fill="#fff" fill-opacity="0.25"/>${
        fill > 0 ? `<rect x="${cursor.toFixed(1)}" y="${y}" width="${(w * fill).toFixed(1)}" height="12" rx="6" fill="${color}"/>` : ''
      }`;
      cursor += w + gap;
      return bar;
    })
    .join('');
}

function remainingAfter(queue: RoutineItem[], index: number, elapsedInItem: number) {
  return queue.slice(index).reduce((acc, item, k) => acc + getItemDuration(item) - (k === 0 ? elapsedInItem : 0), 0);
}

/** Phase card that opens a new block (1.2 s), like the app's announcement. */
function announcement(item: RoutineItem, queue: RoutineItem[], index: number): { tone: Tone; title: string; sub: string } | null {
  const prev = queue[index - 1];
  if (item.kind === 'warmup' && prev?.kind !== 'warmup') {
    return { tone: 'warm', title: 'Calentamiento', sub: `${queue.filter((q) => q.kind === 'warmup').length} ejercicios suaves` };
  }
  if (item.kind === 'workout' && item.exerciseIndexInRound === 1) {
    return {
      tone: 'work',
      title: item.round === 1 ? 'Parte principal' : `Ronda ${item.round}`,
      sub: `Ronda ${item.round} de ${item.totalRounds} · ${item.totalExercisesPerRound} ejercicios`,
    };
  }
  return null;
}

/** Exercise (warm-up or workout): the clip with what, where and how long. */
function exercisePart(index: number, seconds: number): Part {
  return {
    name: `ex${index}`,
    render: async (ctx, out) => {
      const item = ctx.queue[index] as Extract<RoutineItem, { kind: 'warmup' | 'workout' }>;
      const tone: Tone = item.kind === 'warmup' ? 'warm' : 'work';
      const warmups = ctx.queue.filter((q) => q.kind === 'warmup');
      const where =
        item.kind === 'warmup'
          ? `Ejercicio ${warmups.indexOf(item) + 1} de ${warmups.length}`
          : `Ronda ${item.round} de ${item.totalRounds} · Ejercicio ${item.exerciseIndexInRound} de ${item.totalExercisesPerRound}`;
      const title = wrap(item.exercise.title, 16);
      const titleSize = title.some((l) => l.length > 13) ? 84 : 96;

      const header = join(ctx.dir, `ex${index}-h.png`);
      await png(
        svg(
          W,
          H,
          `<defs>
             <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
             <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
           </defs>
           <rect width="${W}" height="720" fill="url(#t)"/>
           <rect y="${H - 820}" width="${W}" height="820" fill="url(#b)"/>
           ${text(64, 215, ctx.handle, 30, '#fff', { weight: 700, opacity: 0.7 })}
           ${pill(64, 250, item.kind === 'warmup' ? 'CALENTAMIENTO' : 'PARTE PRINCIPAL', TONE_FILL[tone], TONE_TEXT[tone])}
           ${title.map((l, i) => text(64, 420 + i * (titleSize + 6), l, titleSize, '#fff', { weight: 800 })).join('')}
           ${text(64, 420 + title.length * (titleSize + 6) + 10, where, 40, '#fff', { weight: 600, opacity: 0.85 })}`,
        ),
        header,
      );

      // One small image per second: the clock, a cheer, and the routine bar.
      const seqDir = join(ctx.dir, `ex${index}`);
      await fs.mkdir(seqDir);
      const n = Math.ceil(seconds);
      await Promise.all(
        Array.from({ length: n }, (_, s) =>
          png(
            svg(
              W,
              420,
              `${text(64, 60, cheerFor(ctx.queue, index, s, seconds) ?? '', 46, TONE_FILL[tone], { weight: 800 })}
               ${text(64, 270, clock(seconds - s), 210, '#fff', { weight: 800 })}
               ${progressBar(ctx.queue, index, s / seconds, 64, 312, 836)}
               ${text(64, 376, where.split(' · ')[0], 32, '#fff', { weight: 700, opacity: 0.8 })}
               ${text(900, 376, `Quedan ${clock(remainingAfter(ctx.queue, index, s))}`, 32, '#fff', { weight: 700, anchor: 'end', opacity: 0.8 })}`,
            ),
            join(seqDir, `${String(s).padStart(4, '0')}.png`),
          ),
        ),
      );

      const inputs = [
        '-stream_loop',
        '-1',
        '-i',
        ctx.clips.get(item.exercise.video_url)!,
        '-loop',
        '1',
        '-i',
        header,
        '-framerate',
        '1',
        '-i',
        join(seqDir, '%04d.png'),
      ];
      let graph = `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=0:d=0.4:alpha=1[h];[v][h]overlay=0:0[a];[2:v]fps=30[c];[a][c]overlay=0:${H - 420 - 340}:eof_action=repeat[b]`;
      const card = announcement(item, ctx.queue, index);
      if (card) {
        const cardPng = join(ctx.dir, `ex${index}-a.png`);
        const fg = TONE_TEXT[card.tone];
        await png(
          svg(
            W,
            H,
            `<rect width="${W}" height="${H}" fill="${TONE_FILL[card.tone]}" fill-opacity="0.94"/>
             ${text(W / 2, 960, card.title, card.title.length > 12 ? 118 : 150, fg, { weight: 800, anchor: 'middle' })}
             ${text(W / 2, 1050, card.sub, 46, fg, { weight: 600, anchor: 'middle', opacity: 0.85 })}`,
          ),
          cardPng,
        );
        inputs.push('-loop', '1', '-t', '1.6', '-i', cardPng);
        graph += `;[3:v]format=rgba,fade=out:st=1.15:d=0.4:alpha=1[k];[b][k]overlay=0:0:eof_action=pass[out]`;
      } else {
        graph += ';[b]null[out]';
      }
      await ff([...inputs, '-filter_complex', graph, '-map', '[out]', ...outArgs(ctx, seconds, out)]);
    },
  };
}

/** Rest: its own blue screen, a ring emptying around the count, the next clip as a small preview. */
function restPart(index: number, seconds: number): Part {
  return {
    name: `rest${index}`,
    render: async (ctx, out) => {
      const item = ctx.queue[index] as Extract<RoutineItem, { kind: 'rest' }>;
      const hole = { x: 388, y: 860, w: 304, h: 540, r: 34 };
      const seqDir = join(ctx.dir, `rest${index}`);
      await fs.mkdir(seqDir);
      const n = Math.ceil(seconds);
      const ring = 2 * Math.PI * 150;
      const line = REST_LINES[index % REST_LINES.length];
      const next = wrap(item.nextExercise.title, 22, 1)[0];
      await Promise.all(
        Array.from({ length: n }, (_, s) => {
          const left = seconds - s;
          const prep = left <= 3;
          return png(
            svg(
              W,
              H,
              `<defs><radialGradient id="g" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#5b8bff"/><stop offset="0.7" stop-color="${C.rest}"/></radialGradient></defs>
               <path fill-rule="evenodd" fill="url(#g)" d="M0 0H${W}V${H}H0Z M${hole.x + hole.r} ${hole.y}H${hole.x + hole.w - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w} ${hole.y + hole.r}V${hole.y + hole.h - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w - hole.r} ${hole.y + hole.h}H${hole.x + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x} ${hole.y + hole.h - hole.r}V${hole.y + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.r} ${hole.y}Z"/>
               <rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}" rx="${hole.r}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/>
               ${text(64, 215, ctx.handle, 30, '#fff', { weight: 700, opacity: 0.7 })}
               ${pill(64, 250, item.isEndOfRound ? `RONDA ${Math.max(1, item.nextRound - 1)} COMPLETADA` : 'DESCANSO', 'rgba(255,255,255,0.22)', '#fff')}
               ${text(W / 2, 400, prep ? 'Prepárate' : 'Descansa', 100, '#fff', { weight: 800, anchor: 'middle' })}
               <circle cx="${W / 2}" cy="600" r="150" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="14"/>
               <circle cx="${W / 2}" cy="600" r="150" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-dasharray="${ring.toFixed(1)}" stroke-dashoffset="${(ring * (1 - left / seconds)).toFixed(1)}" transform="rotate(-90 ${W / 2} 600)"/>
               ${text(W / 2, 662, String(Math.ceil(left)), 170, prep ? C.ink : '#fff', { weight: 800, anchor: 'middle' })}
               ${pill(hole.x + 18, hole.y + 18, 'VISTA PREVIA', 'rgba(0,0,0,0.55)', '#fff', 22)}
               ${text(W / 2, 1458, 'SIGUIENTE', 30, '#fff', { weight: 800, anchor: 'middle', spacing: 4, opacity: 0.75 })}
               ${text(W / 2, 1522, next, 52, '#fff', { weight: 800, anchor: 'middle' })}
               ${text(W / 2, 816, prep ? '¡Vamos!' : line, 40, '#fff', { weight: 600, anchor: 'middle', opacity: 0.9 })}`,
            ),
            join(seqDir, `${String(s).padStart(4, '0')}.png`),
          );
        }),
      );
      await ff([
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${W}x${H}:r=30`,
        '-stream_loop',
        '-1',
        '-i',
        ctx.clips.get(item.nextExercise.video_url)!,
        '-framerate',
        '1',
        '-i',
        join(seqDir, '%04d.png'),
        '-filter_complex',
        `[1:v]scale=${hole.w}:${hole.h}:force_original_aspect_ratio=increase,crop=${hole.w}:${hole.h},fps=30[p];[0:v][p]overlay=${hole.x}:${hole.y}[b];[2:v]fps=30[c];[b][c]overlay=0:0:eof_action=repeat[out]`,
        '-map',
        '[out]',
        ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/** 15 s teaser: one quick shot per exercise with its name. */
function cutPart(exercise: Exercise, k: number, of: number, seconds: number): Part {
  return {
    name: `cut${k}`,
    render: async (ctx, out) => {
      const overlay = join(ctx.dir, `cut${k}.png`);
      const title = wrap(exercise.title, 16);
      await png(
        svg(
          W,
          H,
          `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient></defs>
           <rect y="${H - 900}" width="${W}" height="900" fill="url(#b)"/>
           ${pill(64, 1200, `${k + 1} / ${of}`, C.heat, '#fff', 34)}
           ${title.map((l, i) => text(64, 1380 + i * 100, l, 96, '#fff', { weight: 800 })).join('')}`,
        ),
        overlay,
      );
      const file = ctx.clips.get(exercise.video_url)!;
      const clipSeconds = Math.max(seconds + 1, Number(exercise.duration_seconds) || 30);
      await ff([
        '-ss',
        (clipSeconds * 0.35).toFixed(2),
        '-stream_loop',
        '-1',
        '-i',
        file,
        '-loop',
        '1',
        '-i',
        overlay,
        '-filter_complex',
        `[0:v]${COVER},scale=${Math.round(W * 1.08)}:-1,crop=${W}:${H}[v];[v][1:v]overlay=0:0[out]`,
        '-map',
        '[out]',
        ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/* ── the job ──────────────────────────────────────────────────────────────── */

function partsFor(mode: ExportMode, queue: RoutineItem[], meta: RoutineMeta): Part[] {
  // Every video opens the same way, but with that day's sentence: it types itself, Marcel gets
  // ready, the plan appears over the day's exercises.
  const opening = [typingPart(), marcelPart(4.7)];
  if (mode === 'summary') {
    const shots = dayExercises(meta).slice(0, 5);
    return [...opening, planPart(2.6), ...shots.map((e, k) => cutPart(e, k, shots.length, 1.1)), endPart(2.4)];
  }
  return [...opening, ...queue.flatMap((item, index): Part[] => {
    const seconds = getItemDuration(item, meta.slotSeconds);
    switch (item.kind) {
      case 'intro':
        return [];
      case 'summary':
        return [planPart(Math.min(seconds, 5))];
      case 'warmup':
      case 'workout':
        return [exercisePart(index, seconds)];
      case 'rest':
        return [restPart(index, seconds)];
      case 'outro':
        return [endPart(Math.min(seconds, 4))];
    }
  })];
}

/** Only clips from this project's own Supabase bucket: ffmpeg must never be pointed at anything else. */
function allowedVideoUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/workout-videos/`) && !url.includes('..');
}

export function collectVideoUrls(mode: ExportMode, queue: RoutineItem[], meta: RoutineMeta): string[] {
  const urls = new Set<string>();
  if (mode === 'summary') dayExercises(meta).forEach((e) => urls.add(e.video_url));
  else
    queue.forEach((item) => {
      if (item.kind === 'warmup' || item.kind === 'workout') urls.add(item.exercise.video_url);
      if (item.kind === 'rest') urls.add(item.nextExercise.video_url);
    });
  return [...urls];
}

export function validateExport(mode: ExportMode, queue: RoutineItem[], meta: RoutineMeta): string | null {
  if (!Array.isArray(queue) || queue.length === 0 || queue.length > 400) return 'Rutina vacía o demasiado larga.';
  if (!meta || !Array.isArray(meta.circuit)) return 'Faltan los datos de la rutina.';
  const bad = collectVideoUrls(mode, queue, meta).find((u) => typeof u !== 'string' || !allowedVideoUrl(u));
  return bad ? 'Hay un vídeo que no es de la biblioteca de EverydayM.' : null;
}

/** The user's sentence, made safe to draw: printable, one line, short. Falls back to "Piernas, 30 minutos". */
export function cleanPrompt(raw: unknown, meta: RoutineMeta): string {
  const typed = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} ,.¿?¡!'-]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
  if (typed.length >= 3) return typed.slice(0, 44);
  return `${meta.focusLabel || 'Full body'}, ${plan(meta).minutes} minutos`;
}

export async function runExport(
  job: ExportJob,
  opts: { mode: ExportMode; queue: RoutineItem[]; meta: RoutineMeta; handle: string; prompt: string },
): Promise<void> {
  const dir = await fs.mkdtemp(join(os.tmpdir(), 'everydaym-tiktok-'));
  try {
    const ctx: Ctx = {
      dir,
      clips: new Map(),
      encoder: await pickEncoder(opts.mode),
      handle: opts.handle,
      meta: opts.meta,
      queue: opts.queue,
      prompt: opts.prompt,
    };

    job.step = 'Descargando tus clips';
    const urls = collectVideoUrls(opts.mode, opts.queue, opts.meta);
    for (let i = 0; i < urls.length; i += 4) {
      await Promise.all(
        urls.slice(i, i + 4).map(async (url, k) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`No se pudo descargar un clip (${res.status}).`);
          const file = join(dir, `clip${i + k}${path.extname(new URL(url).pathname) || '.mp4'}`);
          await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
          ctx.clips.set(url, file);
        }),
      );
      job.progress = 0.1 * Math.min(1, (i + 4) / urls.length);
    }

    const parts = partsFor(opts.mode, opts.queue, opts.meta);
    const files = parts.map((p, i) => join(dir, `part${String(i).padStart(3, '0')}.mp4`));
    let done = 0;
    job.step = 'Montando el vídeo';
    // ponytail: 3 parts at a time; raise if the machine has cores to spare.
    for (let i = 0; i < parts.length; i += 3) {
      await Promise.all(
        parts.slice(i, i + 3).map(async (part, k) => {
          await part.render(ctx, files[i + k]);
          done += 1;
          job.progress = 0.1 + 0.85 * (done / parts.length);
          job.step = `Montando el vídeo · parte ${done} de ${parts.length}`;
        }),
      );
    }

    job.step = 'Uniendo las partes';
    const list = join(dir, 'parts.txt');
    await fs.writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const output = join(os.tmpdir(), `everydaym-${opts.mode}-${randomUUID()}.mp4`);
    await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', output]);

    job.file = output;
    job.progress = 1;
    job.step = 'Listo';
    job.status = 'done';
  } catch (error) {
    job.status = 'error';
    job.error = error instanceof Error ? error.message.slice(0, 400) : 'Error al exportar.';
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

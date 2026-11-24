import 'server-only';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { REST_LINES, cheerFor, getItemDuration, uniqueExercises } from '@/lib/routine';
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
// TikTok covers the left/right 120 px, the bottom 660 px and a column on the right: keep words inside.
const L = 108;
const C = { paper: '#e9e9e7', ink: '#131313', heat: '#ff3b30', warm: '#ff9f0a', rest: '#2f6bff' };
// Runtime temp paths: tell the bundler not to trace them (it would ship the whole project).
const join = (...parts: string[]) => path.join(/* turbopackIgnore: true */ ...parts);

export type ExportMode = 'summary' | 'full' | 'top3' | 'challenge' | 'carousel';
export interface ExportJob {
  status: 'running' | 'done' | 'error';
  progress: number; // 0..1
  step: string;
  error?: string;
  file?: string; // the MP4, or the ZIP of slides for a carousel
  slides?: string[]; // carousel images, in order
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
  const [rate, crf] = mode === 'full' ? ['3200k', '24'] : ['6M', '20'];
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
  return uniqueExercises(meta);
}

/** Same routine → same words; another routine → (most likely) other words. */
function pick<T>(meta: RoutineMeta, salt: number, options: T[]): T {
  let h = salt;
  // hashed on the first block, which is what the old single circuit was
  for (const ch of (meta.blocks[0] ?? []).map((e) => e.id).join('|')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
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
           <rect x="0" y="500" width="${W}" height="${H - 500}" fill="url(#g)"/>
           ${title.map((l, i) => text(L, 1140 - (title.length - 1 - i) * 118, l, 112, '#fff', { weight: 800 })).join('')}
           ${text(L, 1230, ctx.handle, 36, '#fff', { weight: 700, opacity: 0.75 })}`,
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
        `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=${Math.min(0.8, seconds - 1).toFixed(2)}:d=0.5:alpha=1[o];[v][o]overlay=0:0:shortest=1[out]`,
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
      const top = 300; // rows stay above y 840, where the like/comment column starts
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
      // Words a first-timer gets with the sound off: which block, which lap, how many left.
      const left = item.kind === 'workout' ? item.totalRounds - item.round : 0;
      const where =
        item.kind === 'warmup'
          ? `Calentamiento · ${warmups.indexOf(item) + 1} de ${warmups.length}`
          : `Vuelta ${item.round} · ${left <= 0 ? 'la última' : left === 1 ? 'queda 1' : `quedan ${left}`}`;
      const n = item.kind === 'warmup' ? warmups.indexOf(item) + 1 : item.exerciseIndexInRound;
      const of = item.kind === 'warmup' ? warmups.length : item.totalExercisesPerRound;
      const dots = Array.from({ length: of }, (_, d) => `<circle cx="${L + 12 + d * 34}" cy="560" r="10" fill="${d < n ? TONE_FILL[tone] : '#fff'}" fill-opacity="${d < n ? 1 : 0.35}"/>`).join('');
      const title = wrap(item.exercise.title, 14);
      const titleSize = title.some((l) => l.length > 12) ? 78 : 88;

      // Everything sits in TikTok's safe box (x 108-900, y 240-1260): the caption and the
      // like/comment column cover the rest.
      const header = join(ctx.dir, `ex${index}-h.png`);
      await png(
        svg(
          W,
          H,
          `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.72"/><stop offset="0.75" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
           <rect width="${W}" height="1120" fill="url(#t)"/>
           ${pill(L, 250, item.kind === 'warmup' ? 'CALENTAMIENTO' : 'PARTE PRINCIPAL', TONE_FILL[tone], TONE_TEXT[tone])}
           ${title.map((l, i) => text(L, 410 + i * (titleSize + 4), l, titleSize, '#fff', { weight: 800 })).join('')}
           <g transform="translate(0 ${(title.length - 1) * (titleSize + 4)})">
             ${text(L, 520, where, 38, '#fff', { weight: 700, opacity: 0.9 })}
             ${dots}
           </g>`,
        ),
        header,
      );

      // One small image per second, under the header: the clock, the routine bar, a cheer.
      const seqDir = join(ctx.dir, `ex${index}`);
      await fs.mkdir(seqDir);
      const shift = (title.length - 1) * (titleSize + 4);
      const after = ctx.queue.slice(index + 1).find((q) => q.kind === 'warmup' || q.kind === 'workout');
      const upNext = after && (after.kind === 'warmup' || after.kind === 'workout') ? wrap(after.exercise.title, 22, 1)[0] : null;
      await Promise.all(
        Array.from({ length: Math.ceil(seconds) }, (_, s) => {
          const t = seconds - s;
          const line = upNext && t <= 8 ? `Siguiente: ${upNext}` : (cheerFor(ctx.queue, index, s, seconds) ?? '');
          return png(
            svg(
              W,
              440,
              `${text(L, 170, t >= 60 ? clock(t) : String(Math.ceil(t)), 180, t <= 3 ? C.heat : '#fff', { weight: 800 })}
               ${progressBar(ctx.queue, index, s / seconds, L, 210, 900 - L)}
               ${text(900, 268, `Quedan ${clock(remainingAfter(ctx.queue, index, s))}`, 30, '#fff', { weight: 700, anchor: 'end', opacity: 0.8 })}
               ${text(L, 340, line, 42, upNext && t <= 8 ? '#fff' : TONE_FILL[tone], { weight: 800 })}`,
            ),
            join(seqDir, `${String(s).padStart(4, '0')}.png`),
          );
        }),
      );

      const inputs = ['-stream_loop', '-1', '-i', ctx.clips.get(item.exercise.video_url)!, '-loop', '1', '-i', header, '-framerate', '1', '-i', join(seqDir, '%04d.png')];
      let graph = `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=0:d=0.4:alpha=1[h];[v][h]overlay=0:0[a];[2:v]fps=30[c];[a][c]overlay=0:${600 + shift}:eof_action=repeat[b]`;
      const card = announcement(item, ctx.queue, index);
      if (card) {
        const cardPng = join(ctx.dir, `ex${index}-a.png`);
        const fg = TONE_TEXT[card.tone];
        await png(
          svg(
            W,
            H,
            `<rect width="${W}" height="${H}" fill="${TONE_FILL[card.tone]}" fill-opacity="0.94"/>
             ${text(W / 2 - 30, 800, card.title, card.title.length > 12 ? 112 : 140, fg, { weight: 800, anchor: 'middle' })}
             ${text(W / 2 - 30, 890, card.sub, 44, fg, { weight: 600, anchor: 'middle', opacity: 0.85 })}`,
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
      const hole = { x: 412, y: 905, w: 256, h: 350, r: 30 };
      const seqDir = join(ctx.dir, `rest${index}`);
      await fs.mkdir(seqDir);
      const ring = 2 * Math.PI * 128;
      const line = REST_LINES[index % REST_LINES.length];
      const next = wrap(item.nextExercise.title, 22, 1)[0];
      const cx = W / 2 - 30; // a little left of centre: the like/comment column is on the right
      await Promise.all(
        Array.from({ length: Math.ceil(seconds) }, (_, s) => {
          const left = seconds - s;
          const prep = left <= 3;
          return png(
            svg(
              W,
              H,
              `<defs><radialGradient id="g" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#5b8bff"/><stop offset="0.7" stop-color="${C.rest}"/></radialGradient></defs>
               <path fill-rule="evenodd" fill="url(#g)" d="M0 0H${W}V${H}H0Z M${hole.x + hole.r} ${hole.y}H${hole.x + hole.w - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w} ${hole.y + hole.r}V${hole.y + hole.h - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w - hole.r} ${hole.y + hole.h}H${hole.x + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x} ${hole.y + hole.h - hole.r}V${hole.y + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.r} ${hole.y}Z"/>
               <rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}" rx="${hole.r}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/>
               ${pill(L, 250, item.isEndOfRound ? `VUELTA ${Math.max(1, item.nextRound - 1)} HECHA` : 'DESCANSO', 'rgba(255,255,255,0.22)', '#fff')}
               ${text(cx, 410, prep ? 'Prepárate' : 'Descansa', 96, '#fff', { weight: 800, anchor: 'middle' })}
               <circle cx="${cx}" cy="590" r="128" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="12"/>
               <circle cx="${cx}" cy="590" r="128" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="${ring.toFixed(1)}" stroke-dashoffset="${(ring * (1 - left / seconds)).toFixed(1)}" transform="rotate(-90 ${cx} 590)"/>
               ${text(cx, 642, String(Math.ceil(left)), 146, prep ? C.ink : '#fff', { weight: 800, anchor: 'middle' })}
               ${text(cx, 790, prep ? '¡Vamos!' : line, 38, '#fff', { weight: 600, anchor: 'middle', opacity: 0.9 })}
               ${text(cx, 862, `Siguiente: ${next}`, 44, '#fff', { weight: 800, anchor: 'middle' })}`,
            ),
            join(seqDir, `${String(s).padStart(4, '0')}.png`),
          );
        }),
      );
      await ff([
        '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30`,
        '-stream_loop', '-1', '-i', ctx.clips.get(item.nextExercise.video_url)!,
        '-framerate', '1', '-i', join(seqDir, '%04d.png'),
        '-filter_complex', `[1:v]scale=${hole.w}:${hole.h}:force_original_aspect_ratio=increase,crop=${hole.w}:${hole.h},fps=30[p];[0:v][p]overlay=${hole.x}:${hole.y}[b];[2:v]fps=30[c];[b][c]overlay=0:0:eof_action=repeat[out]`,
        '-map', '[out]', ...outArgs(ctx, seconds, out),
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
           <rect y="600" width="${W}" height="${H - 600}" fill="url(#b)"/>
           ${pill(L, 960, `${k + 1} / ${of}`, C.heat, '#fff', 34)}
           ${title.map((l, i) => text(L, 1130 + i * 100, l, 96, '#fff', { weight: 800 })).join('')}`,
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


/* ── short formats: hook card, numbered list, 1-minute challenge ─────────── */

/** A title over one of today's clips, blurred. Used as a hook: the words are there from frame one. */
function titlePart(name: string, seconds: number, bg: (day: Exercise[]) => Exercise, words: (ctx: Ctx) => { kicker?: string; title: string; sub?: string }): Part {
  return {
    name,
    render: async (ctx, out) => {
      const w = words(ctx);
      const title = wrap(w.title, 12, 3);
      const size = title.some((l) => l.length > 10) ? 116 : 136;
      const top = 820 - (title.length * (size + 8)) / 2;
      const card = join(ctx.dir, `${name}.png`);
      await png(
        svg(
          W,
          H,
          `${w.kicker ? pill(64, top - 130, w.kicker, C.heat, '#fff', 30) : ''}
           ${title.map((l, i) => text(64, top + (i + 1) * (size + 8) - 16, l, size, '#fff', { weight: 800 })).join('')}
           ${w.sub ? text(64, top + title.length * (size + 8) + 60, w.sub, 46, '#fff', { weight: 600, opacity: 0.9 }) : ''}`,
        ),
        card,
      );
      const clip = bg(dayExercises(ctx.meta));
      const clipSeconds = Math.max(seconds + 1, Number(clip.duration_seconds) || 30);
      await ff([
        '-ss', (clipSeconds * 0.4).toFixed(2), '-stream_loop', '-1', '-i', ctx.clips.get(clip.video_url)!,
        '-loop', '1', '-i', card,
        '-filter_complex', `[0:v]${COVER},boxblur=16:2,eq=brightness=-0.25:saturation=1.1[b];[b][1:v]overlay=0:0[out]`,
        '-map', '[out]', ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/** "3 ejercicios para…": the clip with a big number, its name and how long to do it. */
function listItemPart(exercise: Exercise, k: number, of: number, seconds: number): Part {
  return {
    name: `item${k}`,
    render: async (ctx, out) => {
      const overlay = join(ctx.dir, `item${k}.png`);
      const title = wrap(exercise.title, 15);
      const work = ctx.meta.slotSeconds || 40;
      await png(
        svg(
          W,
          H,
          `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient>
             <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
           <rect width="${W}" height="520" fill="url(#t)"/>
           <rect y="560" width="${W}" height="${H - 560}" fill="url(#b)"/>
           ${text(L, 300, `${of} ejercicios para ${(ctx.meta.focusLabel || 'todo el cuerpo').toLowerCase()}`.toUpperCase(), 32, '#fff', { weight: 800, spacing: 3, opacity: 0.9 })}
           ${text(L, 960, String(k + 1), 280, C.heat, { weight: 800 })}
           ${title.map((l, i) => text(L, 1066 + i * 96, l, 90, '#fff', { weight: 800 })).join('')}
           ${pill(L, 1086 + title.length * 96 - 40, `${work} S · SIN MATERIAL`, 'rgba(255,255,255,0.22)', '#fff', 28)}`,
        ),
        overlay,
      );
      const clipSeconds = Math.max(seconds + 1, Number(exercise.duration_seconds) || 30);
      await ff([
        '-ss', (clipSeconds * 0.3).toFixed(2), '-stream_loop', '-1', '-i', ctx.clips.get(exercise.video_url)!,
        '-loop', '1', '-i', overlay,
        '-filter_complex', `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=0:d=0.25:alpha=1[o];[v][o]overlay=0:0[out]`,
        '-map', '[out]', ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/** 1-minute challenge: three exercises back to back with a big clock and three progress bars. */
function challengePart(exercise: Exercise, k: number, of: number, seconds: number, next?: Exercise): Part {
  return {
    name: `ch${k}`,
    render: async (ctx, out) => {
      const seqDir = join(ctx.dir, `ch${k}`);
      await fs.mkdir(seqDir);
      const title = wrap(exercise.title, 16, 1)[0];
      const segW = (900 - L - (of - 1) * 16) / of;
      await Promise.all(
        Array.from({ length: Math.ceil(seconds) }, (_, s) => {
          const left = Math.ceil(seconds - s);
          const bars = Array.from({ length: of }, (_, b) => {
            const x = L + b * (segW + 16);
            const fill = b < k ? 1 : b === k ? s / seconds : 0;
            return `<rect x="${x}" y="250" width="${segW}" height="12" rx="6" fill="#fff" fill-opacity="0.3"/>${fill > 0 ? `<rect x="${x}" y="250" width="${(segW * fill).toFixed(1)}" height="12" rx="6" fill="#fff"/>` : ''}`;
          }).join('');
          const last3 = left <= 3 && next;
          return png(
            svg(
              W,
              H,
              `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
                 <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
               <rect width="${W}" height="480" fill="url(#t)"/>
               <rect y="560" width="${W}" height="${H - 560}" fill="url(#b)"/>
               ${bars}
               ${text(L, 340, `RETO 1 MINUTO · ${k + 1} DE ${of}`, 30, '#fff', { weight: 800, spacing: 3, opacity: 0.9 })}
               ${text(L, 960, title, 80, '#fff', { weight: 800 })}
               ${text(L, 1245, String(left), 230, left <= 3 ? C.heat : '#fff', { weight: 800 })}
               ${last3 ? text(L, 1030, `Siguiente: ${wrap(next.title, 18, 1)[0]}`, 40, '#fff', { weight: 700, opacity: 0.9 }) : ''}`,
            ),
            join(seqDir, `${String(s).padStart(4, '0')}.png`),
          );
        }),
      );
      const clipSeconds = Math.max(seconds + 1, Number(exercise.duration_seconds) || 30);
      await ff([
        '-ss', (clipSeconds * 0.25).toFixed(2), '-stream_loop', '-1', '-i', ctx.clips.get(exercise.video_url)!,
        '-framerate', '1', '-i', join(seqDir, '%04d.png'),
        '-filter_complex', `[0:v]${COVER}[v];[1:v]fps=30[c];[v][c]overlay=0:0:eof_action=repeat[out]`,
        '-map', '[out]', ...outArgs(ctx, seconds, out),
      ]);
    },
  };
}

/* ── photo carousel (TikTok photo mode): cover, one slide per exercise, the plan ── */

async function renderCarousel(ctx: Ctx, job: ExportJob): Promise<string[]> {
  const { minutes, shape } = plan(ctx.meta);
  const day = dayExercises(ctx.meta).slice(0, 8);
  const focus = ctx.meta.focusLabel || 'Full body';
  const frame = async (e: Exercise, name: string) => {
    const file = join(ctx.dir, `${name}.jpg`);
    const at = Math.max(1, (Number(e.duration_seconds) || 30) * 0.4);
    await ff(['-ss', at.toFixed(2), '-i', ctx.clips.get(e.video_url)!, '-frames:v', '1', '-vf', COVER.replace(',fps=30', ''), '-q:v', '3', file]);
    return file;
  };
  const slide = async (bg: string, overlay: string, name: string, blur = false) => {
    const out = join(ctx.dir, `${name}.jpg`);
    let base = sharp(bg).resize(W, H, { fit: 'cover' });
    if (blur) base = base.blur(28).modulate({ brightness: 0.72 });
    await base.composite([{ input: Buffer.from(svg(W, H, overlay)) }]).jpeg({ quality: 86 }).toFile(out);
    return out;
  };
  const gradient = `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient></defs><rect y="560" width="${W}" height="${H - 560}" fill="url(#b)"/>`;
  const slides: string[] = [];

  const coverBg = await frame(day[0], 'f0');
  const title = wrap(`Rutina de ${focus.toLowerCase()}`, 11, 3);
  slides.push(
    await slide(
      coverBg,
      `${pill(64, 560, 'EN CASA · SIN MATERIAL', C.heat, '#fff', 30)}
       ${title.map((l, i) => text(64, 800 + i * 140, l, 136, '#fff', { weight: 800 })).join('')}
       ${text(64, 820 + title.length * 140, `${minutes} min · ${shape}`, 48, '#fff', { weight: 600, opacity: 0.9 })}
       ${text(64, 1240, 'Desliza para ver los ejercicios  →', 40, '#fff', { weight: 700, opacity: 0.85 })}`,
      'slide00',
      true,
    ),
  );
  for (let k = 0; k < day.length; k++) {
    job.step = `Preparando las fotos · ${k + 1} de ${day.length}`;
    const bg = k === 0 ? coverBg : await frame(day[k], `f${k}`);
    const name = wrap(day[k].title, 15);
    slides.push(
      await slide(
        bg,
        `${gradient}
         ${pill(64, 250, `${k + 1} / ${day.length}`, C.heat, '#fff', 32)}
         ${name.map((l, i) => text(L, 1060 + i * 100, l, 96, '#fff', { weight: 800 })).join('')}
         ${text(L, 1080 + name.length * 100, `${ctx.meta.slotSeconds || 40} s · ${ctx.meta.rounds} vueltas`, 44, '#fff', { weight: 600, opacity: 0.9 })}`,
        `slide${String(k + 1).padStart(2, '0')}`,
      ),
    );
  }
  const warmups = ctx.meta.warmups?.length ?? 0;
  slides.push(
    await slide(
      coverBg,
      `${text(64, 420, 'ASÍ SE HACE', 36, '#fff', { weight: 800, spacing: 6, opacity: 0.8 })}
       ${[warmups ? [C.warm, `Calentamiento · ${warmups} ejercicios`] : null, [C.heat, `${shape}`], [C.rest, 'Descanso corto entre ejercicios']]
         .filter((r): r is string[] => r !== null)
         .map(([color, line], i) => `<circle cx="84" cy="${540 + i * 100}" r="20" fill="${color}"/>${text(128, 558 + i * 100, line, 50, '#fff', { weight: 700 })}`)
         .join('')}
       ${pill(64, 900, 'GUÁRDALA PARA HOY', '#fff', C.ink, 34)}
       ${text(64, 1060, ctx.handle, 44, '#fff', { weight: 800 })}`,
      `slide${String(day.length + 1).padStart(2, '0')}`,
      true,
    ),
  );
  return slides;
}

/* ── the job ──────────────────────────────────────────────────────────────── */

function partsFor(mode: ExportMode, queue: RoutineItem[], meta: RoutineMeta): Part[] {
  // Every video opens the same way, but with that day's sentence: it types itself, Marcel gets
  // ready, the plan appears over the day's exercises.
  const opening = [typingPart(), marcelPart(4.7)];
  const day = dayExercises(meta);
  const focus = (meta.focusLabel || 'todo el cuerpo').toLowerCase();
  if (mode === 'summary') {
    const shots = day.slice(0, 4);
    return [...opening, planPart(2.6), ...shots.map((e, k) => cutPart(e, k, shots.length, 1.6)), endPart(2.4)];
  }
  if (mode === 'top3') {
    const three = day.slice(0, 3);
    return [
      titlePart('hook', 1.8, (d) => d[0], () => ({ kicker: 'SIN MATERIAL', title: `${three.length} ejercicios para ${focus}`, sub: 'Guárdalo para tu próximo entreno' })),
      ...three.map((e, k) => listItemPart(e, k, three.length, 4)),
      endPart(2.4),
    ];
  }
  if (mode === 'challenge') {
    const three = day.slice(0, 3);
    return [
      titlePart('hook', 2, (d) => d[0], () => ({ kicker: 'RETO', title: 'Aguanta 1 minuto conmigo', sub: `${meta.focusLabel} · sin parar` })),
      ...three.map((e, k) => challengePart(e, k, three.length, 20, three[k + 1])),
      titlePart('end', 2.6, (d) => d[Math.min(2, d.length - 1)], (ctx) => ({ title: '¿Lo has aguantado?', sub: `Comenta «hecho» · ${ctx.handle}` })),
    ];
  }
  // The routine no longer has a plan step, but the full video still shows the plan after the opening.
  return [...opening, planPart(5), ...queue.flatMap((item, index): Part[] => {
    const seconds = getItemDuration(item, meta.slotSeconds);
    switch (item.kind) {
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
  if (mode !== 'full') dayExercises(meta).forEach((e) => urls.add(e.video_url));
  else
    queue.forEach((item) => {
      if (item.kind === 'warmup' || item.kind === 'workout') urls.add(item.exercise.video_url);
      if (item.kind === 'rest') urls.add(item.nextExercise.video_url);
    });
  return [...urls];
}

export function validateExport(mode: ExportMode, queue: RoutineItem[], meta: RoutineMeta): string | null {
  if (!Array.isArray(queue) || queue.length === 0 || queue.length > 400) return 'Rutina vacía o demasiado larga.';
  if (!meta || !Array.isArray(meta.blocks) || !meta.blocks.every(Array.isArray)) return 'Faltan los datos de la rutina.';
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

    if (opts.mode === 'carousel') {
      // Photos, not a video: keep them (the work dir is deleted) and zip them for one download.
      const made = await renderCarousel(ctx, job);
      const keep = join(os.tmpdir(), `everydaym-carousel-${randomUUID()}`);
      await fs.mkdir(keep);
      const names = made.map((_, i) => `everydaym-${String(i + 1).padStart(2, '0')}.jpg`);
      await Promise.all(made.map((f, i) => fs.copyFile(f, join(keep, names[i]))));
      job.step = 'Comprimiendo las fotos';
      const zip = join(keep, 'everydaym-carrusel.zip');
      // bsdtar (macOS, Windows 10+) writes a .zip when asked with -a
      await execFileAsync('tar', ['-a', '-cf', zip, '-C', keep, ...names], { windowsHide: true });
      job.slides = names.map((n) => join(keep, n));
      job.file = zip;
      job.progress = 1;
      job.step = 'Listo';
      job.status = 'done';
      return;
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

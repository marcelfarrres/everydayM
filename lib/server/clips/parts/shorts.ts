import 'server-only';
import fs from 'node:fs/promises';
import { C, L, frameName, full, pill, png, pngSequence, text, wrap } from '@/lib/server/clips/draw';
import { COVER, H, W, join, renderPart } from '@/lib/server/clips/run';
import { dayExercises, seekable, source, type Ctx, type Part } from '@/lib/server/clips/context';
import type { Exercise } from '@/types/workout';

/* Short formats: quick cuts, a hook card, the numbered list and the 1-minute challenge. */

/** Teaser shot: one quick look at an exercise with its name. */
export function cutPart(exercise: Exercise, k: number, of: number, seconds: number): Part {
  return {
    name: `cut${k}`,
    render: async (ctx, out) => {
      const overlay = join(ctx.dir, `cut${k}.png`);
      const title = wrap(exercise.title, 16);
      await png(
        full(
          `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient></defs>
           <rect y="600" width="${W}" height="${H - 600}" fill="url(#b)"/>
           ${pill(L, 960, `${k + 1} / ${of}`, C.heat, '#fff', 34)}
           ${title.map((l, i) => text(L, 1130 + i * 100, l, 96, '#fff', { weight: 800 })).join('')}`,
        ),
        overlay,
      );
      await renderPart({
        inputs: ['-ss', (seekable(exercise, seconds) * 0.35).toFixed(2), '-stream_loop', '-1', '-i', source(ctx, exercise.video_url), '-loop', '1', '-i', overlay],
        graph: `[0:v]${COVER},scale=${Math.round(W * 1.08)}:-1,crop=${W}:${H}[v];[v][1:v]overlay=0:0[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

/** A title over one of the clip's exercises, blurred. Used as a hook: the words are there from frame one. */
export function titlePart(
  name: string,
  seconds: number,
  bg: (day: Exercise[]) => Exercise,
  words: (ctx: Ctx) => { kicker?: string; title: string; sub?: string },
): Part {
  return {
    name,
    render: async (ctx, out) => {
      const w = words(ctx);
      const title = wrap(w.title, 12, 3);
      const size = title.some((l) => l.length > 10) ? 116 : 136;
      const top = 820 - (title.length * (size + 8)) / 2;
      const card = join(ctx.dir, `${name}.png`);
      await png(
        full(
          `${w.kicker ? pill(64, top - 130, w.kicker, C.heat, '#fff', 30) : ''}
           ${title.map((l, i) => text(64, top + (i + 1) * (size + 8) - 16, l, size, '#fff', { weight: 800 })).join('')}
           ${w.sub ? text(64, top + title.length * (size + 8) + 60, w.sub, 46, '#fff', { weight: 600, opacity: 0.9 }) : ''}`,
        ),
        card,
      );
      const clip = bg(dayExercises(ctx.meta));
      await renderPart({
        inputs: ['-ss', (seekable(clip, seconds) * 0.4).toFixed(2), '-stream_loop', '-1', '-i', source(ctx, clip.video_url), '-loop', '1', '-i', card],
        graph: `[0:v]${COVER},boxblur=16:2,eq=brightness=-0.25:saturation=1.1[b];[b][1:v]overlay=0:0[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

/** "3 ejercicios para…": the clip with a big number, its name and how long to do it. */
export function listItemPart(exercise: Exercise, k: number, of: number, seconds: number): Part {
  return {
    name: `item${k}`,
    render: async (ctx, out) => {
      const overlay = join(ctx.dir, `item${k}.png`);
      const title = wrap(exercise.title, 15);
      const work = ctx.meta.slotSeconds || 40;
      await png(
        full(
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
      await renderPart({
        inputs: ['-ss', (seekable(exercise, seconds) * 0.3).toFixed(2), '-stream_loop', '-1', '-i', source(ctx, exercise.video_url), '-loop', '1', '-i', overlay],
        graph: `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=0:d=0.25:alpha=1[o];[v][o]overlay=0:0[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

/** 1-minute challenge: three exercises back to back with a big clock and three progress bars. */
export function challengePart(exercise: Exercise, k: number, of: number, seconds: number, next?: Exercise): Part {
  return {
    name: `ch${k}`,
    render: async (ctx, out) => {
      const seqDir = join(ctx.dir, `ch${k}`);
      await fs.mkdir(seqDir);
      const title = wrap(exercise.title, 16, 1)[0];
      const segW = (900 - L - (of - 1) * 16) / of;
      await pngSequence(
        Math.ceil(seconds),
        (s) => {
          const left = Math.ceil(seconds - s);
          const bars = Array.from({ length: of }, (_, b) => {
            const x = L + b * (segW + 16);
            const fill = b < k ? 1 : b === k ? s / seconds : 0;
            return `<rect x="${x}" y="250" width="${segW}" height="12" rx="6" fill="#fff" fill-opacity="0.3"/>${fill > 0 ? `<rect x="${x}" y="250" width="${(segW * fill).toFixed(1)}" height="12" rx="6" fill="#fff"/>` : ''}`;
          }).join('');
          const last3 = left <= 3 && next;
          return full(
            `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
               <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
             <rect width="${W}" height="480" fill="url(#t)"/>
             <rect y="560" width="${W}" height="${H - 560}" fill="url(#b)"/>
             ${bars}
             ${text(L, 340, `RETO 1 MINUTO · ${k + 1} DE ${of}`, 30, '#fff', { weight: 800, spacing: 3, opacity: 0.9 })}
             ${text(L, 960, title, 80, '#fff', { weight: 800 })}
             ${text(L, 1245, String(left), 230, left <= 3 ? C.heat : '#fff', { weight: 800 })}
             ${last3 ? text(L, 1030, `Siguiente: ${wrap(next.title, 18, 1)[0]}`, 40, '#fff', { weight: 700, opacity: 0.9 }) : ''}`,
          );
        },
        (s) => join(seqDir, frameName(s)),
      );
      await renderPart({
        inputs: ['-ss', (seekable(exercise, seconds) * 0.25).toFixed(2), '-stream_loop', '-1', '-i', source(ctx, exercise.video_url), '-framerate', '1', '-i', join(seqDir, '%04d.png')],
        graph: `[0:v]${COVER}[v];[1:v]fps=30[c];[v][c]overlay=0:0:eof_action=repeat[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

import 'server-only';
import fs from 'node:fs/promises';
import { REST_LINES, TALK_LEAD_MS, cheerFor, getItemDuration } from '@/lib/routine';
import { C, FONT, L, TONE_FILL, TONE_TEXT, clock, esc, frameName, full, pill, png, pngSequence, svg, text, wrap, type Tone } from '@/lib/server/clips/draw';
import { COVER, H, VOICE_FORMAT, W, join, renderPart } from '@/lib/server/clips/run';
import { CTAS, dayExercises, pick, plan, seekable, source, type Ctx, type Part } from '@/lib/server/clips/context';
import type { ExerciseTalk, RoutineItem } from '@/types/workout';

/*
 * The parts of the full routine (and the plan/end cards other types reuse): the plan over a
 * mosaic, each exercise with its clock, each rest, and the end card.
 */

type RestItem = Extract<RoutineItem, { kind: 'rest' }>;
type ExerciseItem = Extract<RoutineItem, { kind: 'warmup' | 'workout' }>;

/** The plan over a mosaic of today's exercises, all moving. */
export function planPart(seconds: number): Part {
  return {
    name: 'plan',
    render: async (ctx, out) => {
      const { minutes, shape } = plan(ctx.meta);
      const day = dayExercises(ctx.meta);
      const tiles = Array.from({ length: 6 }, (_, i) => day[i % day.length]);
      const overlay = join(ctx.dir, 'plan.png');
      const warmups = ctx.meta.warmups?.length ?? 0;
      const rest = ctx.queue.find((q): q is RestItem => q.kind === 'rest' && q.restKind !== 'long') ?? ctx.queue.find((q): q is RestItem => q.kind === 'rest');
      const rows = [
        warmups > 0 ? [C.warm, 'Calentamiento', `${warmups} ejercicios`] : null,
        [C.heat, 'Parte principal', shape],
        rest ? [C.rest, 'Descansos', `${Math.round(rest.duration)} s`] : null,
      ].filter((r): r is string[] => r !== null);
      const band = 300 + rows.length * 90;
      const top = 300; // rows stay above y 840, where the like/comment column starts
      await png(
        full(
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
      const inputs = tiles.flatMap((ex, i) => [
        '-ss',
        (seekable(ex, seconds) * (0.2 + 0.1 * i)).toFixed(2),
        '-stream_loop',
        '-1',
        '-i',
        source(ctx, ex.video_url),
      ]);
      const graph =
        tiles.map((_, i) => `[${i}:v]scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1,fps=30[t${i}]`).join(';') +
        `;${tiles.map((_, i) => `[t${i}]`).join('')}xstack=inputs=6:layout=${pos.join('|')}:fill=black,` +
        `scale=w='trunc(${W}*(1.12-0.12*min(t/${seconds},1))/2)*2':h=-2:eval=frame,crop=${W}:${H},setsar=1[g];` +
        `[6:v]format=rgba,fade=in:st=0.25:d=0.4:alpha=1[o];[g][o]overlay=0:0[out]`;
      await renderPart({ inputs: [...inputs, '-loop', '1', '-i', overlay], graph, seconds, out, encoder: ctx.encoder });
    },
  };
}

/** End card over one of today's clips, blurred and dimmed so the words read. */
export function endPart(seconds: number): Part {
  return {
    name: 'end',
    render: async (ctx, out) => {
      const { minutes, shape } = plan(ctx.meta);
      const day = dayExercises(ctx.meta);
      const bg = day[day.length - 1];
      const card = join(ctx.dir, 'end.png');
      const cta = wrap(pick(ctx, 13, CTAS), 13, 3);
      await png(
        full(
          `${cta.map((l, i) => text(64, 760 + i * 128, l, 120, '#fff', { weight: 800 })).join('')}
           ${text(64, 760 + cta.length * 128 + 10, `${ctx.meta.focusLabel} · ${minutes} min · ${shape}`, 42, '#fff', { weight: 600, opacity: 0.85 })}
           ${pill(64, 760 + cta.length * 128 + 70, ctx.handle.toUpperCase(), C.heat, '#fff', 34)}`,
        ),
        card,
      );
      await renderPart({
        inputs: ['-ss', (seekable(bg, seconds) * 0.5).toFixed(2), '-stream_loop', '-1', '-i', source(ctx, bg.video_url), '-loop', '1', '-i', card],
        graph: `[0:v]${COVER},boxblur=22:2,eq=brightness=-0.22:saturation=1.15[b];[1:v]format=rgba,fade=in:st=0.1:d=0.4:alpha=1[o];[b][o]overlay=0:0[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
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

const series = (n: number) => `${n} ${n === 1 ? 'serie' : 'series'}`;

/** Phase card that opens a new block (1.2 s), like the app's announcement. */
function announcement(item: RoutineItem, queue: RoutineItem[], index: number): { tone: Tone; title: string; sub: string } | null {
  const prev = queue[index - 1];
  if (item.kind === 'warmup' && prev?.kind !== 'warmup') {
    return { tone: 'warm', title: 'Calentamiento', sub: `${queue.filter((q) => q.kind === 'warmup').length} ejercicios suaves` };
  }
  if (item.kind === 'workout' && item.exerciseIndexInRound === 1) {
    return {
      tone: 'work',
      title: item.round === 1 ? 'Parte principal' : `Bloque ${item.round}`,
      sub: `Bloque ${item.round} de ${item.totalRounds} · ${series(item.totalExercisesPerRound)}`,
    };
  }
  return null;
}

/** Exercise (warm-up or workout): the clip with what, where and how long. */
export function exercisePart(index: number, seconds: number): Part {
  return {
    name: `ex${index}`,
    render: async (ctx, out) => {
      const item = ctx.queue[index] as ExerciseItem;
      const tone: Tone = item.kind === 'warmup' ? 'warm' : 'work';
      const warmups = ctx.queue.filter((q) => q.kind === 'warmup');
      // Words a first-timer gets with the sound off: which block, how many left.
      const left = item.kind === 'workout' ? item.totalRounds - item.round : 0;
      const where =
        item.kind === 'warmup'
          ? `Calentamiento · ${warmups.indexOf(item) + 1} de ${warmups.length}`
          : `Bloque ${item.round} · ${left <= 0 ? 'el último' : left === 1 ? 'queda 1' : `quedan ${left}`}`;
      const n = item.kind === 'warmup' ? warmups.indexOf(item) + 1 : item.exerciseIndexInRound;
      const of = item.kind === 'warmup' ? warmups.length : item.totalExercisesPerRound;
      const dots = Array.from({ length: of }, (_, d) => `<circle cx="${L + 12 + d * 34}" cy="560" r="10" fill="${d < n ? TONE_FILL[tone] : '#fff'}" fill-opacity="${d < n ? 1 : 0.35}"/>`).join('');
      const title = wrap(item.exercise.title, 14);
      const titleSize = title.some((l) => l.length > 12) ? 78 : 88;

      // Everything sits in TikTok's safe box (x 108-900, y 240-1260): the caption and the
      // like/comment column cover the rest.
      const header = join(ctx.dir, `ex${index}-h.png`);
      await png(
        full(
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
      const after = ctx.queue.slice(index + 1).find((q): q is ExerciseItem => q.kind === 'warmup' || q.kind === 'workout');
      const upNext = after ? wrap(after.exercise.title, 22, 1)[0] : null;
      await pngSequence(
        Math.ceil(seconds),
        (s) => {
          const t = seconds - s;
          const line = upNext && t <= 8 ? `Siguiente: ${upNext}` : (cheerFor(ctx.queue, index, s, seconds) ?? '');
          return svg(
            W,
            440,
            `${text(L, 170, t >= 60 ? clock(t) : String(Math.ceil(t)), 180, t <= 3 ? C.heat : '#fff', { weight: 800 })}
             ${progressBar(ctx.queue, index, s / seconds, L, 210, 900 - L)}
             ${text(900, 268, `Quedan ${clock(remainingAfter(ctx.queue, index, s))}`, 30, '#fff', { weight: 700, anchor: 'end', opacity: 0.8 })}
             ${text(L, 340, line, 42, upNext && t <= 8 ? '#fff' : TONE_FILL[tone], { weight: 800 })}`,
          );
        },
        (s) => join(seqDir, frameName(s)),
      );

      const inputs = ['-stream_loop', '-1', '-i', source(ctx, item.exercise.video_url), '-loop', '1', '-i', header, '-framerate', '1', '-i', join(seqDir, '%04d.png')];
      let graph = `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=0:d=0.4:alpha=1[h];[v][h]overlay=0:0[a];[2:v]fps=30[c];[a][c]overlay=0:${600 + shift}:eof_action=repeat[b]`;
      const card = announcement(item, ctx.queue, index);
      if (card) {
        const cardPng = join(ctx.dir, `ex${index}-a.png`);
        const fg = TONE_TEXT[card.tone];
        await png(
          full(
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
      await renderPart({ inputs, graph, seconds, out, encoder: ctx.encoder });
    },
  };
}

/** What a rest is closing: the warm-up, a block, or just a serie. */
function restLabel(item: RestItem): string {
  if (item.isEndOfRound) return `BLOQUE ${Math.max(1, item.nextRound - 1)} HECHO`;
  if (item.restKind === 'long' && item.nextRound === 1) return 'CALENTAMIENTO HECHO';
  return 'DESCANSO';
}

const HOLE = { x: 412, y: 905, w: 256, h: 350, r: 30 };
const RING = 2 * Math.PI * 128;

/** One second of the blue rest screen: a ring emptying around the count, a hole for the preview. */
function restFrame(item: RestItem, index: number, seconds: number, s: number): string {
  const hole = HOLE;
  const left = seconds - s;
  const prep = left <= 3;
  const cx = W / 2 - 30; // a little left of centre: the like/comment column is on the right
  const line = REST_LINES[index % REST_LINES.length];
  const next = wrap(item.nextExercise.title, 22, 1)[0];
  return full(
    `<defs><radialGradient id="g" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#5b8bff"/><stop offset="0.7" stop-color="${C.rest}"/></radialGradient></defs>
     <path fill-rule="evenodd" fill="url(#g)" d="M0 0H${W}V${H}H0Z M${hole.x + hole.r} ${hole.y}H${hole.x + hole.w - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w} ${hole.y + hole.r}V${hole.y + hole.h - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w - hole.r} ${hole.y + hole.h}H${hole.x + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x} ${hole.y + hole.h - hole.r}V${hole.y + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.r} ${hole.y}Z"/>
     <rect x="${hole.x}" y="${hole.y}" width="${hole.w}" height="${hole.h}" rx="${hole.r}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/>
     ${pill(L, 250, restLabel(item), 'rgba(255,255,255,0.22)', '#fff')}
     ${text(cx, 410, prep ? 'Prepárate' : 'Descansa', 96, '#fff', { weight: 800, anchor: 'middle' })}
     <circle cx="${cx}" cy="590" r="128" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="12"/>
     <circle cx="${cx}" cy="590" r="128" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${(RING * (1 - left / seconds)).toFixed(1)}" transform="rotate(-90 ${cx} 590)"/>
     ${text(cx, 642, String(Math.ceil(left)), 146, prep ? C.ink : '#fff', { weight: 800, anchor: 'middle' })}
     ${text(cx, 790, prep ? '¡Vamos!' : line, 38, '#fff', { weight: 600, anchor: 'middle', opacity: 0.9 })}
     ${text(cx, 862, `Siguiente: ${next}`, 44, '#fff', { weight: 800, anchor: 'middle' })}`,
  );
}

/** Rest without talks: the blue screen, with the next clip as a small preview in its hole. */
export function restPart(index: number, seconds: number): Part {
  return {
    name: `rest${index}`,
    render: async (ctx, out) => {
      const item = ctx.queue[index] as RestItem;
      const seqDir = join(ctx.dir, `rest${index}`);
      await fs.mkdir(seqDir);
      await pngSequence(Math.ceil(seconds), (s) => restFrame(item, index, seconds, s), (s) => join(seqDir, frameName(s)));
      const hole = HOLE;
      await renderPart({
        inputs: [
          '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30`,
          '-stream_loop', '-1', '-i', source(ctx, item.nextExercise.video_url),
          '-framerate', '1', '-i', join(seqDir, '%04d.png'),
        ],
        graph: `[1:v]scale=${hole.w}:${hole.h}:force_original_aspect_ratio=increase,crop=${hole.w}:${hole.h},fps=30[p];[0:v][p]overlay=${hole.x}:${hole.y}[b];[2:v]fps=30[c];[b][c]overlay=0:0:eof_action=repeat[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

/** Seconds of a talk: what ffprobe saw, else what the catalog says. */
export function talkSeconds(ctx: Ctx, talk: ExerciseTalk): number {
  const probed = ctx.info.get(talk.video_url)?.seconds ?? 0;
  if (probed > 0) return probed;
  const stored = Number(talk.duration_seconds);
  return Number.isFinite(stored) && stored > 0 ? stored : 15;
}

/**
 * Video + voice of some talks back to back, as filter labels `[tv]` and `[ta]` (VOICE_FORMAT),
 * from inputs starting at `first`. A talk without an audio track gets silence.
 */
export function talksGraph(ctx: Ctx, talks: readonly ExerciseTalk[], first: number, budget: number): { graph: string; seconds: number } {
  let remaining = budget;
  const pieces: string[] = [];
  const pairs: string[] = [];
  let total = 0;
  talks.forEach((talk, k) => {
    const d = Math.min(talkSeconds(ctx, talk), remaining);
    if (d <= 0.2) return;
    remaining -= d;
    total += d;
    const i = first + k;
    pieces.push(`[${i}:v]${COVER},trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS[tv${k}]`);
    pieces.push(
      ctx.info.get(talk.video_url)?.hasAudio === false
        ? `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${d.toFixed(3)}[ta${k}]`
        : `[${i}:a]atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${d.toFixed(3)}[ta${k}]`,
    );
    pairs.push(`[tv${k}][ta${k}]`);
  });
  pieces.push(`${pairs.join('')}concat=n=${pairs.length}:v=1:a=1[tv][ta]`);
  return { graph: pieces.join(';'), seconds: total };
}

/**
 * Long rest with talks: the blue rest screen while the app's clouds would open, then Marcel's
 * talks full screen with his voice, inside a blue frame with the count and what comes next.
 */
export function talkRestPart(index: number, seconds: number): Part {
  return {
    name: `talkrest${index}`,
    render: async (ctx, out) => {
      const item = ctx.queue[index] as RestItem;
      const lead = Math.min(TALK_LEAD_MS / 1000, Math.max(0, seconds - 1));
      const talks = talksGraph(ctx, item.talks, 3, seconds - lead);
      if (talks.seconds <= 0) return restPart(index, seconds).render(ctx, out);
      const talkInputs = item.talks.flatMap((t) => ['-i', source(ctx, t.video_url)]);
      const talkEnd = lead + talks.seconds;

      const baseDir = join(ctx.dir, `rest${index}`);
      const frameDir = join(ctx.dir, `talkrest${index}`);
      await fs.mkdir(baseDir);
      await fs.mkdir(frameDir);
      await pngSequence(Math.ceil(seconds), (s) => restFrame(item, index, seconds, s), (s) => join(baseDir, frameName(s)));
      const next = wrap(item.nextExercise.title, 22, 1)[0];
      await pngSequence(
        Math.ceil(seconds),
        (s) => {
          if (s + 1 <= lead || s >= talkEnd) return full('');
          const left = Math.ceil(seconds - s);
          return full(
            `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
             <rect width="${W}" height="520" fill="url(#t)"/>
             <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="56" fill="none" stroke="${C.rest}" stroke-width="28"/>
             ${pill(L, 250, restLabel(item), C.rest, '#fff')}
             ${text(L, 400, `Descanso · ${left}`, 56, '#fff', { weight: 800 })}
             ${text(L, 460, `Luego: ${next}`, 38, '#fff', { weight: 700, opacity: 0.85 })}`,
          );
        },
        (s) => join(frameDir, frameName(s)),
      );

      const hole = HOLE;
      const delay = Math.round(lead * 1000);
      await renderPart({
        inputs: [
          '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30`,
          '-stream_loop', '-1', '-i', source(ctx, item.nextExercise.video_url),
          '-framerate', '1', '-i', join(baseDir, '%04d.png'),
          ...talkInputs,
          '-framerate', '1', '-i', join(frameDir, '%04d.png'),
        ],
        graph:
          `[1:v]scale=${hole.w}:${hole.h}:force_original_aspect_ratio=increase,crop=${hole.w}:${hole.h},fps=30[p];[0:v][p]overlay=${hole.x}:${hole.y}[b0];` +
          `[2:v]fps=30[c];[b0][c]overlay=0:0:eof_action=repeat[base];` +
          `${talks.graph};` +
          `[tv]setpts=PTS+${lead.toFixed(3)}/TB[tvs];[base][tvs]overlay=0:0:eof_action=pass[b1];` +
          `[${3 + item.talks.length}:v]fps=30[f];[b1][f]overlay=0:0:eof_action=repeat[out];` +
          `[ta]adelay=delays=${delay}:all=1,${VOICE_FORMAT}[voice]`,
        seconds,
        out,
        encoder: ctx.encoder,
        voice: '[voice]',
      });
    },
  };
}

/** The right part for a rest: with talks when it is a long rest that has them. */
export function anyRestPart(item: RestItem, index: number, seconds: number): Part {
  return item.restKind === 'long' && Array.isArray(item.talks) && item.talks.length > 0 ? talkRestPart(index, seconds) : restPart(index, seconds);
}

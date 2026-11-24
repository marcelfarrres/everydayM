import 'server-only';
import { C, L, full, pill, png, text, wrap } from '@/lib/server/clips/draw';
import { COVER, H, VOICE_FORMAT, W, join, renderPart } from '@/lib/server/clips/run';
import { source, type Part } from '@/lib/server/clips/context';
import { talkSeconds } from '@/lib/server/clips/parts/routine';
import type { Exercise, ExerciseTalk } from '@/types/workout';

/**
 * One vídeo hablado, whole, with Marcel's voice. With `title`, it opens with the same headline
 * treatment as Marcel's clip in the opening (dark fade, big white words, the handle) for a few
 * seconds; then only a small label with the exercise stays at the top.
 */
export function talkPart(talk: ExerciseTalk, exercise: Exercise, opts: { title: boolean; kicker: string }): Part {
  return {
    name: `talk-${talk.id}`,
    render: async (ctx, out) => {
      const seconds = talkSeconds(ctx, talk);
      const hold = Math.max(1.2, Math.min(3.6, seconds - 1.5));
      const label = wrap(exercise.title.toUpperCase(), 24, 1)[0];
      const labelPng = join(ctx.dir, `talk-${talk.id}-label.png`);
      await png(
        full(
          `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
           <rect width="${W}" height="420" fill="url(#t)"/>
           ${pill(L, 250, label, 'rgba(255,255,255,0.22)', '#fff', 30)}`,
        ),
        labelPng,
      );
      const inputs = ['-i', source(ctx, talk.video_url)];
      let graph = `[0:v]${COVER}[v];`;
      if (opts.title) {
        const title = wrap(exercise.title, 14);
        const titlePng = join(ctx.dir, `talk-${talk.id}-title.png`);
        await png(
          full(
            `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs>
             <rect x="0" y="500" width="${W}" height="${H - 500}" fill="url(#g)"/>
             ${pill(L, 1000 - title.length * 118 - 20, opts.kicker, C.heat, '#fff', 30)}
             ${title.map((l, i) => text(L, 1140 - (title.length - 1 - i) * 118, l, 112, '#fff', { weight: 800 })).join('')}
             ${text(L, 1230, ctx.handle, 36, '#fff', { weight: 700, opacity: 0.75 })}`,
          ),
          titlePng,
        );
        inputs.push('-loop', '1', '-i', titlePng, '-loop', '1', '-i', labelPng);
        graph +=
          `[1:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1,fade=out:st=${hold.toFixed(2)}:d=0.5:alpha=1[o];[v][o]overlay=0:0[a];` +
          `[2:v]format=rgba,fade=in:st=${(hold + 0.3).toFixed(2)}:d=0.4:alpha=1[p];[a][p]overlay=0:0[out]`;
      } else {
        inputs.push('-loop', '1', '-i', labelPng);
        graph += `[1:v]format=rgba,fade=in:st=0.2:d=0.4:alpha=1[p];[v][p]overlay=0:0[out]`;
      }
      const hasVoice = ctx.info.get(talk.video_url)?.hasAudio !== false;
      if (hasVoice) graph += `;[0:a]${VOICE_FORMAT}[voice]`;
      await renderPart({ inputs, graph, seconds, out, encoder: ctx.encoder, voice: hasVoice ? '[voice]' : undefined });
    },
  };
}

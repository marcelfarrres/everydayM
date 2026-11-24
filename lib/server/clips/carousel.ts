import 'server-only';
import sharp from 'sharp';
import { C, L, full, pill, text, wrap } from '@/lib/server/clips/draw';
import { COVER, H, W, ff, join } from '@/lib/server/clips/run';
import { dayExercises, plan, source, type Ctx } from '@/lib/server/clips/context';
import type { Exercise } from '@/types/workout';

/** Photo carousel (TikTok photo mode): cover, one slide per exercise, the plan. Returns the JPGs in order. */
export async function renderCarousel(ctx: Ctx, onStep: (step: string) => void): Promise<string[]> {
  const { minutes, shape } = plan(ctx.meta);
  const day = dayExercises(ctx.meta).slice(0, 8);
  const focus = ctx.meta.focusLabel || 'Full body';
  const frame = async (e: Exercise, name: string) => {
    const file = join(ctx.dir, `${name}.jpg`);
    const at = Math.max(1, (Number(e.duration_seconds) || 30) * 0.4);
    await ff(['-ss', at.toFixed(2), '-i', source(ctx, e.video_url), '-frames:v', '1', '-vf', COVER.replace(',fps=30', ''), '-q:v', '3', file]);
    return file;
  };
  const slide = async (bg: string, overlay: string, name: string, blur = false) => {
    const out = join(ctx.dir, `${name}.jpg`);
    let base = sharp(bg).resize(W, H, { fit: 'cover' });
    if (blur) base = base.blur(28).modulate({ brightness: 0.72 });
    await base.composite([{ input: Buffer.from(full(overlay)) }]).jpeg({ quality: 86 }).toFile(out);
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
    onStep(`Preparando las fotos · ${k + 1} de ${day.length}`);
    const bg = k === 0 ? coverBg : await frame(day[k], `f${k}`);
    const name = wrap(day[k].title, 15);
    const blocks = ctx.meta.rounds;
    slides.push(
      await slide(
        bg,
        `${gradient}
         ${pill(64, 250, `${k + 1} / ${day.length}`, C.heat, '#fff', 32)}
         ${name.map((l, i) => text(L, 1060 + i * 100, l, 96, '#fff', { weight: 800 })).join('')}
         ${text(L, 1080 + name.length * 100, `${ctx.meta.slotSeconds || 40} s · ${blocks} ${blocks === 1 ? 'bloque' : 'bloques'}`, 44, '#fff', { weight: 600, opacity: 0.9 })}`,
        `slide${String(k + 1).padStart(2, '0')}`,
      ),
    );
  }
  const warmups = ctx.meta.warmups?.length ?? 0;
  slides.push(
    await slide(
      coverBg,
      `${text(64, 420, 'ASÍ SE HACE', 36, '#fff', { weight: 800, spacing: 6, opacity: 0.8 })}
       ${[warmups ? [C.warm, `Calentamiento · ${warmups} ejercicios`] : null, [C.heat, `${shape}`], [C.rest, 'Descanso corto entre series']]
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

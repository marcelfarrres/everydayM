import { NextRequest, NextResponse } from 'next/server';
import { MAX_SENTENCE_LENGTH } from '@/lib/clips/queue';
import { clipNeedsRoutine, isClipType } from '@/lib/clips/types';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipError, readJson } from '@/lib/server/clips/http';
import { enqueueFromChoice, enqueueFromRoutine, listClips } from '@/lib/server/clips/queue';
import { catalogTitles, cleanHandle, cleanMuscles, describeChoice } from '@/lib/server/clips/select';
import { readClipSentence } from '@/lib/server/clips/sentence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → { items }: the whole queue, newest first, with live progress. */
export async function GET(req: NextRequest) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  try {
    return NextResponse.json({ items: await listClips() });
  } catch (err) {
    return clipError(err);
  }
}

/**
 * POST → { item } (201), and the render starts in the background. One of:
 *   { sentence, handle? }                       what Marcel wrote; read by Gemini or keywords
 *   { type, muscles?, exerciseId?, minutes? }   picked by hand in the Studio
 *   { type, routine: { queue, meta, prompt } }  the player's routine ("···" menu)
 * A request that cannot be met answers 422 with what is missing.
 */
export async function POST(req: NextRequest) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  const handle = cleanHandle(body.handle);

  try {
    if (typeof body.sentence === 'string') {
      const sentence = body.sentence.replace(/\s+/g, ' ').trim().slice(0, MAX_SENTENCE_LENGTH);
      if (sentence.length < 3) return NextResponse.json({ error: 'Escribe qué clip quieres.' }, { status: 400 });
      const read = await readClipSentence(sentence, await catalogTitles());
      const item = await enqueueFromChoice(
        {
          type: read.intent.type,
          muscles: read.intent.muscles,
          exerciseId: null,
          exerciseTitle: read.intent.exercise,
          minutes: read.intent.minutes,
          handle,
        },
        { origin: 'sentence', instruction: sentence },
      );
      return NextResponse.json({ item, read }, { status: 201 });
    }

    if (!isClipType(body.type)) return NextResponse.json({ error: 'Tipo de clip desconocido.' }, { status: 400 });
    const type = body.type;

    if (body.routine && typeof body.routine === 'object') {
      if (!clipNeedsRoutine(type)) return NextResponse.json({ error: 'Este tipo de clip no se hace desde una rutina.' }, { status: 400 });
      const routine = body.routine as { queue?: unknown; meta?: unknown; prompt?: unknown };
      const item = await enqueueFromRoutine({ type, routine: { queue: routine.queue, meta: routine.meta, prompt: routine.prompt }, handle });
      return NextResponse.json({ item }, { status: 201 });
    }

    const muscles = cleanMuscles(body.muscles);
    const exerciseId = typeof body.exerciseId === 'string' && body.exerciseId ? body.exerciseId.slice(0, 80) : null;
    const minutes = typeof body.minutes === 'number' && Number.isFinite(body.minutes) ? Math.round(body.minutes) : null;
    const exerciseTitle = typeof body.exerciseTitle === 'string' ? body.exerciseTitle.slice(0, 120) : null;
    const item = await enqueueFromChoice(
      { type, muscles, exerciseId, exerciseTitle, minutes, handle },
      { origin: 'manual', instruction: describeChoice({ type, muscles, minutes }, exerciseTitle) },
    );
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return clipError(err, 'No se pudo crear el clip.');
  }
}

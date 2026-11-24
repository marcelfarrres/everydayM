import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateRowId } from '@/lib/server/exerciseMetadata';
import { deleteObjects } from '@/lib/server/mediaStore';
import { CatalogNotFoundError, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';
import type { ExerciseTalk } from '@/types/workout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Delete one vídeo hablado: out of the catalog, then its three files (original, lite, poster). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ talkId: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const talkId = validateRowId((await ctx.params).talkId, 'el vídeo hablado');

    const talk = await updateCatalog((catalog): ExerciseTalk => {
      for (const exercise of catalog.exercises) {
        const found = exercise.talks.find((t) => t.id === talkId);
        if (found) {
          exercise.talks = exercise.talks.filter((t) => t.id !== talkId);
          return found;
        }
      }
      throw new CatalogNotFoundError('Vídeo hablado no encontrado.');
    });

    const files = [talk.video_url, talk.video_lite_url, talk.poster_url];
    const expected = files.filter(Boolean).length;
    const removed = await deleteObjects(files);

    return NextResponse.json({
      deleted: true,
      id: talkId,
      exerciseId: talk.exercise_id,
      storageRemoved: removed === expected,
    });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al borrar el vídeo hablado');
  }
}

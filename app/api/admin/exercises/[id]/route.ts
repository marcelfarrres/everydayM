import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateExerciseMetadata, validateRowId } from '@/lib/server/exerciseMetadata';
import { deleteObjects } from '@/lib/server/mediaStore';
import { findExercise, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'el ejercicio');
    const validated = validateExerciseMetadata((await req.json()) as unknown);

    const exercise = await updateCatalog((catalog) => {
      const target = findExercise(catalog, id);
      Object.assign(target, {
        title: validated.title,
        type: validated.type,
        difficulty: validated.difficulty,
        muscle: validated.muscle,
        muscles: validated.muscles,
        equipment: validated.equipment,
      });
      return { ...target };
    });

    return NextResponse.json({ exercise });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al actualizar el ejercicio');
  }
}

/**
 * Delete an exercise and every file that belongs to it: original, lite copy, poster, and the
 * three files of each of its vídeos hablados. The catalog is written first; the files go after.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'el ejercicio');

    const removed = await updateCatalog((catalog) => {
      const target = findExercise(catalog, id);
      catalog.exercises = catalog.exercises.filter((e) => e.id !== id);
      return target;
    });

    const files = [
      removed.video_url,
      removed.video_lite_url,
      removed.poster_url,
      ...removed.talks.flatMap((t) => [t.video_url, t.video_lite_url, t.poster_url]),
    ];
    const expected = new Set(files.filter(Boolean)).size;
    const filesRemoved = await deleteObjects(files);

    return NextResponse.json({
      deleted: true,
      id,
      talksDeleted: removed.talks.length,
      filesRemoved,
      filesExpected: expected,
      storageRemoved: filesRemoved === expected,
    });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al eliminar el ejercicio');
  }
}

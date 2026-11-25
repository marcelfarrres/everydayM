import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateRestPatch, validateRowId } from '@/lib/server/exerciseMetadata';
import { deleteObjects } from '@/lib/server/mediaStore';
import { catalogRests, findRest, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Rename a rest video ({ title }) or enable/disable it ({ enabled: boolean }). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'el vídeo de descanso');
    const patch = validateRestPatch((await req.json()) as unknown);

    const rest = await updateCatalog((catalog) => {
      const target = findRest(catalog, id);
      Object.assign(target, patch);
      return { ...target };
    });
    return NextResponse.json({ rest });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al guardar el vídeo de descanso');
  }
}

/** Delete a rest video: out of the catalog, then its three files (original, lite, poster). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'el vídeo de descanso');
    const removed = await updateCatalog((catalog) => {
      const target = findRest(catalog, id);
      catalog.rests = catalogRests(catalog).filter((r) => r.id !== id);
      return target;
    });

    const files = [removed.video_url, removed.video_lite_url, removed.poster_url];
    const expected = files.filter(Boolean).length;
    const deleted = await deleteObjects(files);

    return NextResponse.json({ deleted: true, id, storageRemoved: deleted === expected });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al borrar el vídeo de descanso');
  }
}

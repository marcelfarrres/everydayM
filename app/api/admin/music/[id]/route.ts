import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateMusicPatch, validateRowId } from '@/lib/server/exerciseMetadata';
import { deleteObject } from '@/lib/server/mediaStore';
import { findTrack, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Edit the text fields or the style of a track, or enable/disable it ({ enabled: boolean }). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'la pista');
    const patch = validateMusicPatch((await req.json()) as unknown);

    const track = await updateCatalog((catalog) => {
      const target = findTrack(catalog, id);
      Object.assign(target, patch);
      return { ...target };
    });
    return NextResponse.json({ track });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al guardar la pista');
  }
}

/** Delete a track: out of the catalog, then its audio file. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const id = validateRowId((await ctx.params).id, 'la pista');
    const removed = await updateCatalog((catalog) => {
      const target = findTrack(catalog, id);
      catalog.music = catalog.music.filter((m) => m.id !== id);
      return target;
    });
    const storageRemoved = await deleteObject(removed.audio_url);
    return NextResponse.json({ deleted: true, id, storageRemoved });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al borrar la pista');
  }
}

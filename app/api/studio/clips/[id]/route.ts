import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipError, clipFromParams } from '@/lib/server/clips/http';
import { deleteClip } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → { item }: one clip, with live progress while it renders. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const item = await clipFromParams(ctx.params);
  return item instanceof NextResponse ? item : NextResponse.json({ item });
}

/** DELETE → { ok }: the clip and its files. Not while it is being rendered. */
export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  try {
    await deleteClip((await ctx.params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return clipError(err, 'No se pudo borrar el clip.');
  }
}

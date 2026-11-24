import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipError, readJson } from '@/lib/server/clips/http';
import { regenerateClip } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { comment? } → { item } (201): a new render of the same request that avoids the old
 * exercises and reads the comment. The old clip stays in the queue as history.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/regenerate'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  try {
    const body = await readJson(req);
    return NextResponse.json({ item: await regenerateClip((await ctx.params).id, body.comment) }, { status: 201 });
  } catch (err) {
    return clipError(err, 'No se pudo regenerar.');
  }
}

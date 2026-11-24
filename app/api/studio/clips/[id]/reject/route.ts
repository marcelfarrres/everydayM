import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipError, readJson } from '@/lib/server/clips/http';
import { reviewClip } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { comment } → { item }: rejected, with what to change (used when regenerating). */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/reject'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  try {
    const body = await readJson(req);
    return NextResponse.json({ item: await reviewClip((await ctx.params).id, 'rejected', body.comment) });
  } catch (err) {
    return clipError(err, 'No se pudo rechazar.');
  }
}

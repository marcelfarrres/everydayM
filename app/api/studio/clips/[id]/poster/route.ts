import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipFromParams, fileResponse } from '@/lib/server/clips/http';
import { clipPosterPath } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → a small JPEG still of the clip, for the queue list. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/poster'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const item = await clipFromParams(ctx.params);
  if (item instanceof NextResponse) return item;
  return fileResponse(req, item.status === 'rendering' ? null : clipPosterPath(item), { contentType: 'image/jpeg' });
}

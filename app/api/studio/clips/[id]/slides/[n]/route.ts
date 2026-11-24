import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipFromParams, downloadName, fileResponse } from '@/lib/server/clips/http';
import { clipSlidePath } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → photo n (0-based) of a carousel; ?download=1 as an attachment. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/slides/[n]'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const { id, n } = await ctx.params;
  const item = await clipFromParams(Promise.resolve({ id }));
  if (item instanceof NextResponse) return item;
  const index = Number(n);
  return fileResponse(req, clipSlidePath(item, index), {
    contentType: 'image/jpeg',
    downloadName:
      req.nextUrl.searchParams.get('download') === '1' ? downloadName(item, `${String(index + 1).padStart(2, '0')}.jpg`) : undefined,
  });
}

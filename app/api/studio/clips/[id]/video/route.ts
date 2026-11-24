import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipFromParams, fileResponse } from '@/lib/server/clips/http';
import { clipFilePath } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → the MP4 for the preview, with byte ranges. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/video'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const item = await clipFromParams(ctx.params);
  if (item instanceof NextResponse) return item;
  if (item.slides > 0) return NextResponse.json({ error: 'Este clip son fotos.' }, { status: 404 });
  return fileResponse(req, clipFilePath(item), { contentType: 'video/mp4' });
}

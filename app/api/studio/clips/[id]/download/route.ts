import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { clipFromParams, downloadName, fileResponse } from '@/lib/server/clips/http';
import { clipFilePath } from '@/lib/server/clips/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → the MP4 (or the carousel's ZIP) as an attachment, to save it on the phone. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/studio/clips/[id]/download'>) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;
  const item = await clipFromParams(ctx.params);
  if (item instanceof NextResponse) return item;
  const zip = item.slides > 0;
  return fileResponse(req, clipFilePath(item), {
    contentType: zip ? 'application/zip' : 'video/mp4',
    downloadName: downloadName(item, zip ? 'zip' : 'mp4'),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { DEFAULT_CLIP_TYPE, isClipType } from '@/lib/clips/types';
import { briefFrom, captionFor, ideaForToday } from '@/lib/server/contentIdeas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { meta, avoid? } → { idea, source } : an idea for today's organic clip.
 * POST { meta, caption: kind } → { caption } : a ready-to-paste TikTok description.
 * Studio only (it spends Gemini quota).
 */
export async function POST(req: NextRequest) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;

  let body: { meta?: unknown; avoid?: unknown; caption?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }
  if (!body.meta || typeof body.meta !== 'object') {
    return NextResponse.json({ error: 'Falta la rutina.' }, { status: 400 });
  }
  const brief = briefFrom(body.meta as Parameters<typeof briefFrom>[0]);

  if (typeof body.caption === 'string') {
    const kind = isClipType(body.caption) ? body.caption : DEFAULT_CLIP_TYPE;
    return NextResponse.json({ caption: captionFor(kind, brief) });
  }

  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((a): a is string => typeof a === 'string').slice(0, 10) : [];
  return NextResponse.json(await ideaForToday(brief, avoid));
}

import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { readCatalog } from '@/lib/server/catalog';
import { mediaDriver } from '@/lib/server/mediaStore';
import { studioErrorResponse } from '@/lib/server/studioHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The Studio library: every exercise of the catalog with its vídeos hablados nested
 * (poster URLs and text only; no media is fetched here). `driver` tells the Studio whether
 * files go to Bunny or to the local development folder.
 */
export async function GET(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const catalog = await readCatalog();
    return NextResponse.json({
      exercises: catalog.exercises,
      updatedAt: catalog.updatedAt,
      driver: mediaDriver(),
    });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al obtener ejercicios', 500);
  }
}

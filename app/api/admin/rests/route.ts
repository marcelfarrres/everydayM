import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateRestMetadata, type ValidatedRestMetadata } from '@/lib/server/exerciseMetadata';
import { storeVideoClip } from '@/lib/server/mediaPipeline';
import { deleteObjects } from '@/lib/server/mediaStore';
import { catalogRests, newId, readCatalog, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';
import {
  progressStreamResponse,
  readMetadataHeader,
  receiveStudioUpload,
  wantsProgressStream,
} from '@/lib/server/studioUpload';
import type { RestVideo } from '@/types/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Every rest video, enabled or not, newest first. */
export async function GET(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    return NextResponse.json({ rests: catalogRests(await readCatalog()) });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al cargar los vídeos de descanso', 500);
  }
}

/**
 * New rest video: raw video in the body, optional x-studio-metadata {"title": "..."}.
 * Silent (the app loops it muted): stores original + lite + poster under rests/ and adds it
 * to the catalog in first place.
 */
async function ingest(
  req: NextRequest,
  metadata: ValidatedRestMetadata,
  send?: (payload: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const upload = await receiveStudioUpload(req, 'mov');
  try {
    send?.({ phase: 'compressing', originalSize: upload.sizeBytes });
    const clip = await storeVideoClip({
      inputPath: upload.inputPath,
      kind: 'rest',
      keepAudio: false,
      onCompressed: (info) => send?.({ phase: 'uploading', originalSize: upload.sizeBytes, ...info }),
    });

    const rest: RestVideo = {
      id: newId(),
      title: metadata.title,
      video_url: clip.videoUrl,
      video_lite_url: clip.liteUrl,
      poster_url: clip.posterUrl,
      duration_seconds: clip.durationSeconds,
      enabled: true,
    };

    try {
      await updateCatalog((catalog) => {
        catalogRests(catalog).unshift(rest);
      });
    } catch (err) {
      await deleteObjects([clip.videoUrl, clip.liteUrl, clip.posterUrl]);
      throw err;
    }

    return {
      rest,
      originalSize: upload.sizeBytes,
      compressedSize: clip.compressedSize,
      durationSeconds: clip.durationSeconds,
    };
  } finally {
    await upload.cleanup();
  }
}

export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  let metadata: ValidatedRestMetadata;
  try {
    metadata = validateRestMetadata(readMetadataHeader(req));
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Datos del vídeo de descanso no válidos');
  }

  if (wantsProgressStream(req)) {
    return progressStreamResponse((send) => ingest(req, metadata, send), 'Error procesando el vídeo de descanso');
  }

  try {
    return NextResponse.json(await ingest(req, metadata));
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error procesando el vídeo de descanso');
  }
}

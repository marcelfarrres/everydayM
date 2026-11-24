import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import {
  validateExerciseMetadata,
  type ValidatedExerciseMetadata,
} from '@/lib/server/exerciseMetadata';
import { storeVideoClip } from '@/lib/server/mediaPipeline';
import { deleteObjects } from '@/lib/server/mediaStore';
import { newId, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';
import {
  progressStreamResponse,
  readMetadataHeader,
  receiveStudioUpload,
  wantsProgressStream,
} from '@/lib/server/studioUpload';
import type { CatalogExercise } from '@/types/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * New exercise clip: raw video in the body, details in x-studio-metadata.
 * Stores original + lite + poster and adds the exercise to the catalog (first place).
 */
async function ingest(
  req: NextRequest,
  metadata: ValidatedExerciseMetadata,
  send?: (payload: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const upload = await receiveStudioUpload(req, 'mov');
  try {
    send?.({ phase: 'compressing', originalSize: upload.sizeBytes });
    const clip = await storeVideoClip({
      inputPath: upload.inputPath,
      kind: 'exercise',
      keepAudio: metadata.type === 'intro',
      onCompressed: (info) => send?.({ phase: 'uploading', originalSize: upload.sizeBytes, ...info }),
    });

    const exercise: CatalogExercise = {
      id: newId(),
      title: metadata.title,
      type: metadata.type,
      difficulty: metadata.difficulty,
      muscle: metadata.muscle,
      muscles: metadata.muscles,
      equipment: metadata.equipment,
      video_url: clip.videoUrl,
      video_lite_url: clip.liteUrl,
      poster_url: clip.posterUrl,
      duration_seconds: clip.durationSeconds,
      talks: [],
    };

    try {
      await updateCatalog((catalog) => {
        catalog.exercises.unshift(exercise);
      });
    } catch (err) {
      await deleteObjects([clip.videoUrl, clip.liteUrl, clip.posterUrl]);
      throw err;
    }

    return {
      exercise,
      originalSize: upload.sizeBytes,
      compressedSize: clip.compressedSize,
      durationSeconds: clip.durationSeconds,
      isHdr: clip.isHdr,
      crfUsed: clip.crfUsed,
    };
  } finally {
    await upload.cleanup();
  }
}

export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  let metadata: ValidatedExerciseMetadata;
  try {
    const raw = readMetadataHeader(req);
    if (raw === undefined) {
      throw new Error('Falta la cabecera x-studio-metadata con los datos del clip.');
    }
    metadata = validateExerciseMetadata(raw);
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Datos del clip no válidos');
  }

  if (wantsProgressStream(req)) {
    return progressStreamResponse((send) => ingest(req, metadata, send), 'Error procesando el vídeo');
  }

  try {
    return NextResponse.json(await ingest(req, metadata));
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error procesando el vídeo');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateRowId, validateTalkMetadata } from '@/lib/server/exerciseMetadata';
import { storeVideoClip } from '@/lib/server/mediaPipeline';
import { deleteObjects } from '@/lib/server/mediaStore';
import { findExercise, newId, readCatalog, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';
import {
  progressStreamResponse,
  readMetadataHeader,
  receiveStudioUpload,
  wantsProgressStream,
} from '@/lib/server/studioUpload';
import type { ExerciseTalk } from '@/types/workout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The vídeos hablados of one exercise, in the order they were added. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const exerciseId = validateRowId((await ctx.params).id, 'el ejercicio');
    const exercise = findExercise(await readCatalog(), exerciseId);
    return NextResponse.json({ talks: exercise.talks });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al cargar los vídeos hablados');
  }
}

/**
 * Attach a new vídeo hablado to the exercise: raw video in the body, optional
 * x-studio-metadata {"note": "..."}. Keeps the voice (about -16 LUFS) and stores
 * original + lite + poster.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  let exerciseId: string;
  let note: string | null;
  try {
    exerciseId = validateRowId((await ctx.params).id, 'el ejercicio');
    note = validateTalkMetadata(readMetadataHeader(req)).note;
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Datos del vídeo hablado no válidos');
  }

  const work = async (send?: (payload: Record<string, unknown>) => void) => {
    // Fail fast, before minutes of FFmpeg, when the exercise is gone.
    findExercise(await readCatalog(), exerciseId);

    const upload = await receiveStudioUpload(req, 'mov');
    try {
      send?.({ phase: 'compressing', originalSize: upload.sizeBytes });
      const clip = await storeVideoClip({
        inputPath: upload.inputPath,
        kind: 'talk',
        keepAudio: true,
        onCompressed: (info) => send?.({ phase: 'uploading', originalSize: upload.sizeBytes, ...info }),
      });

      const talk: ExerciseTalk = {
        id: newId(),
        exercise_id: exerciseId,
        video_url: clip.videoUrl,
        video_lite_url: clip.liteUrl,
        poster_url: clip.posterUrl,
        duration_seconds: clip.durationSeconds,
        note,
      };

      try {
        await updateCatalog((catalog) => {
          findExercise(catalog, exerciseId).talks.push(talk);
        });
      } catch (err) {
        await deleteObjects([clip.videoUrl, clip.liteUrl, clip.posterUrl]);
        throw err;
      }

      return {
        talk,
        originalSize: upload.sizeBytes,
        compressedSize: clip.compressedSize,
        durationSeconds: clip.durationSeconds,
      };
    } finally {
      await upload.cleanup();
    }
  };

  if (wantsProgressStream(req)) {
    return progressStreamResponse((send) => work(send), 'Error procesando el vídeo hablado');
  }
  try {
    return NextResponse.json(await work());
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error procesando el vídeo hablado');
  }
}

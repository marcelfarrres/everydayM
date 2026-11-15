import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import crypto from 'node:crypto';
import { guardStudioApi } from '@/lib/server/studioGate';
import {
  createServerTempFilePath,
  transcodeVideoForStudio,
} from '@/lib/server/ffmpeg';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import {
  validateExerciseMetadata,
  type ValidatedExerciseMetadata,
} from '@/lib/server/exerciseMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function extractRequestFileAndMetadata(req: NextRequest): Promise<{
  inputPath: string;
  originalSize: number;
  metadata: ValidatedExerciseMetadata;
}> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      throw new Error('No se recibió ningún archivo de vídeo.');
    }

    const rawMetaString = formData.get('metadata');
    let rawMeta: unknown;
    if (typeof rawMetaString === 'string' && rawMetaString.trim()) {
      rawMeta = JSON.parse(rawMetaString) as unknown;
    } else {
      const musclesStr = formData.get('muscles');
      rawMeta = {
        title: formData.get('title'),
        type: formData.get('type') ?? 'workout',
        difficulty: Number(formData.get('difficulty') ?? 5),
        equipment: formData.get('equipment') ?? 'ninguno',
        muscles:
          typeof musclesStr === 'string' && musclesStr.trim()
            ? (JSON.parse(musclesStr) as unknown)
            : [],
      };
    }

    const metadata = validateExerciseMetadata(rawMeta);
    const inputPath = await createServerTempFilePath('mov');

    try {
      const webStream =
        fileEntry.stream() as unknown as NodeWebReadableStream<Uint8Array>;
      await pipeline(Readable.fromWeb(webStream), createWriteStream(inputPath));
      const stat = await fs.stat(inputPath);
      return {
        inputPath,
        originalSize: stat.size,
        metadata,
      };
    } catch (err) {
      await fs.rm(inputPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  // Raw binary stream mode (zero memory buffering for large .MOV files)
  const metaHeader = req.headers.get('x-studio-metadata');
  if (!metaHeader) {
    throw new Error('Falta la cabecera x-studio-metadata con los datos del clip.');
  }

  const parsedMeta = JSON.parse(decodeURIComponent(metaHeader)) as unknown;
  const metadata = validateExerciseMetadata(parsedMeta);

  if (!req.body) {
    throw new Error('El cuerpo de la petición está vacío.');
  }

  const inputPath = await createServerTempFilePath('mov');
  try {
    const webStream =
      req.body as unknown as NodeWebReadableStream<Uint8Array>;
    await pipeline(Readable.fromWeb(webStream), createWriteStream(inputPath));
    const stat = await fs.stat(inputPath);
    if (stat.size === 0) {
      throw new Error('El archivo de vídeo recibido está vacío.');
    }
    return {
      inputPath,
      originalSize: stat.size,
      metadata,
    };
  } catch (err) {
    await fs.rm(inputPath, { force: true }).catch(() => {});
    throw err;
  }
}

async function uploadAndInsertExercise(params: {
  compressedPath: string;
  durationSeconds: number;
  metadata: ValidatedExerciseMetadata;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const storageFileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.mp4`;
  const storagePath = `videos/${storageFileName}`;

  const fileBuffer = await fs.readFile(params.compressedPath);

  const { error: uploadError } = await supabaseAdmin.storage
    .from('workout-videos')
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Error al subir a Supabase Storage: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from('workout-videos')
    .getPublicUrl(storagePath);

  const videoUrl = publicUrlData.publicUrl;

  const { data: insertedRows, error: dbError } = await supabaseAdmin
    .from('exercises')
    .insert([
      {
        title: params.metadata.title,
        type: params.metadata.type,
        difficulty: params.metadata.difficulty,
        muscle: params.metadata.muscle,
        muscles: params.metadata.muscles,
        equipment: params.metadata.equipment,
        video_url: videoUrl,
        duration_seconds: params.durationSeconds,
      },
    ])
    .select('*')
    .single();

  if (dbError) {
    // Rollback storage object if DB insert fails
    await supabaseAdmin.storage
      .from('workout-videos')
      .remove([storagePath])
      .catch(() => {});
    throw new Error(`Error al insertar en public.exercises: ${dbError.message}`);
  }

  return insertedRows;
}

export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  const wantsStream = req.headers.get('x-studio-stream') === '1';

  if (!wantsStream) {
    let inputPath: string | null = null;
    try {
      const extracted = await extractRequestFileAndMetadata(req);
      inputPath = extracted.inputPath;

      const transcoded = await transcodeVideoForStudio({
        inputPath,
        keepAudio: extracted.metadata.type === 'intro',
      });

      try {
        const exercise = await uploadAndInsertExercise({
          compressedPath: transcoded.outputPath,
          durationSeconds: transcoded.durationSeconds,
          metadata: extracted.metadata,
        });

        return NextResponse.json({
          exercise,
          originalSize: extracted.originalSize,
          compressedSize: transcoded.sizeBytes,
          durationSeconds: transcoded.durationSeconds,
          isHdr: transcoded.isHdr,
          crfUsed: transcoded.crfUsed,
        });
      } finally {
        await transcoded.cleanup();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error procesando el vídeo';
      return NextResponse.json({ error: message }, { status: 400 });
    } finally {
      if (inputPath) {
        await fs.rm(inputPath, { force: true }).catch(() => {});
      }
    }
  }

  // Streaming NDJSON mode for real-time phase updates (comprimiendo -> subiendo -> done)
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      let inputPath: string | null = null;
      try {
        const extracted = await extractRequestFileAndMetadata(req);
        inputPath = extracted.inputPath;

        sendEvent({
          phase: 'compressing',
          originalSize: extracted.originalSize,
        });

        const transcoded = await transcodeVideoForStudio({
          inputPath,
          keepAudio: extracted.metadata.type === 'intro',
        });

        try {
          sendEvent({
            phase: 'uploading',
            originalSize: extracted.originalSize,
            compressedSize: transcoded.sizeBytes,
            durationSeconds: transcoded.durationSeconds,
            isHdr: transcoded.isHdr,
            crfUsed: transcoded.crfUsed,
          });

          const exercise = await uploadAndInsertExercise({
            compressedPath: transcoded.outputPath,
            durationSeconds: transcoded.durationSeconds,
            metadata: extracted.metadata,
          });

          sendEvent({
            phase: 'done',
            exercise,
            originalSize: extracted.originalSize,
            compressedSize: transcoded.sizeBytes,
            durationSeconds: transcoded.durationSeconds,
            isHdr: transcoded.isHdr,
            crfUsed: transcoded.crfUsed,
          });
        } finally {
          await transcoded.cleanup();
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error procesando el vídeo';
        sendEvent({
          phase: 'error',
          error: message,
        });
      } finally {
        if (inputPath) {
          await fs.rm(inputPath, { force: true }).catch(() => {});
        }
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

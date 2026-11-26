import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { validateMusicMetadata, type ValidatedMusicMetadata } from '@/lib/server/exerciseMetadata';
import { storeMusicTrack } from '@/lib/server/mediaPipeline';
import { deleteObject } from '@/lib/server/mediaStore';
import { newId, readCatalog, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';
import { readMetadataHeader, receiveStudioUpload } from '@/lib/server/studioUpload';
import type { MusicTrack } from '@/types/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Every track of the player's playlist, enabled or not. */
export async function GET(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    return NextResponse.json({ tracks: (await readCatalog()).music });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al cargar la música', 500);
  }
}

/**
 * New track: raw audio file in the body, x-studio-metadata {title, artist, source_url, license,
 * style} (style: one of lib/musicStyles.ts or null; anything else is refused).
 * Transcoded to AAC ~96 kbit/s (.m4a), duration read with ffprobe.
 */
export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  let metadata: ValidatedMusicMetadata;
  try {
    metadata = validateMusicMetadata(readMetadataHeader(req));
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Datos de la pista no válidos');
  }

  try {
    const upload = await receiveStudioUpload(req, 'audio');
    try {
      const stored = await storeMusicTrack(upload.inputPath);
      const track: MusicTrack = {
        id: newId(),
        ...metadata,
        audio_url: stored.audioUrl,
        duration_seconds: stored.durationSeconds,
        enabled: true,
      };
      try {
        await updateCatalog((catalog) => {
          catalog.music.unshift(track);
        });
      } catch (err) {
        await deleteObject(stored.audioUrl);
        throw err;
      }
      return NextResponse.json({ track, sizeBytes: stored.sizeBytes });
    } finally {
      await upload.cleanup();
    }
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al subir la pista');
  }
}

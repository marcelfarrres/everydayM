import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { probeVideo } from '@/lib/server/ffmpeg';
import { probeSourceFor } from '@/lib/server/mediaStore';
import { readCatalog, updateCatalog } from '@/lib/server/catalog';
import { studioErrorResponse } from '@/lib/server/studioHttp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface DurationResult {
  id: string;
  title: string;
  kind: 'exercise' | 'talk';
  previousDuration: number;
  newDuration: number | null;
  status: 'updated' | 'unchanged' | 'error';
  error?: string;
}

/**
 * Read the real length of every exercise clip and every vídeo hablado with ffprobe (headers
 * only) and fix the catalog where it disagrees, in a single write at the end.
 */
export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const catalog = await readCatalog();
    const targets = catalog.exercises.flatMap((exercise) => [
      { id: exercise.id, title: exercise.title, kind: 'exercise' as const, url: exercise.video_url, duration: exercise.duration_seconds },
      ...exercise.talks.map((talk) => ({
        id: talk.id,
        title: `Vídeo hablado · ${exercise.title}`,
        kind: 'talk' as const,
        url: talk.video_url,
        duration: talk.duration_seconds,
      })),
    ]);

    const results: DurationResult[] = [];
    const changes = new Map<string, number>();

    for (const target of targets) {
      const base = { id: target.id, title: target.title, kind: target.kind, previousDuration: target.duration };
      const source = target.url ? probeSourceFor(target.url) : null;
      if (!source) {
        results.push({ ...base, newDuration: null, status: 'error', error: 'Sin URL de vídeo válida' });
        continue;
      }
      try {
        const newDuration = (await probeVideo(source)).durationRounded;
        if (newDuration === target.duration) {
          results.push({ ...base, newDuration, status: 'unchanged' });
        } else {
          changes.set(`${target.kind}:${target.id}`, newDuration);
          results.push({ ...base, newDuration, status: 'updated' });
        }
      } catch (err: unknown) {
        results.push({
          ...base,
          newDuration: null,
          status: 'error',
          error: err instanceof Error ? err.message : 'No se pudo leer la duración con ffprobe',
        });
      }
    }

    if (changes.size > 0) {
      await updateCatalog((fresh) => {
        for (const exercise of fresh.exercises) {
          const exerciseDuration = changes.get(`exercise:${exercise.id}`);
          if (exerciseDuration !== undefined) exercise.duration_seconds = exerciseDuration;
          for (const talk of exercise.talks) {
            const talkDuration = changes.get(`talk:${talk.id}`);
            if (talkDuration !== undefined) talk.duration_seconds = talkDuration;
          }
        }
      });
    }

    const count = (kind: DurationResult['kind'], status?: DurationResult['status']) =>
      results.filter((r) => r.kind === kind && (!status || r.status === status)).length;

    return NextResponse.json({
      total: results.length,
      updated: changes.size,
      failed: results.filter((r) => r.status === 'error').length,
      exercises: { total: count('exercise'), updated: count('exercise', 'updated'), failed: count('exercise', 'error') },
      talks: { total: count('talk'), updated: count('talk', 'updated'), failed: count('talk', 'error') },
      results,
    });
  } catch (err: unknown) {
    return studioErrorResponse(err, 'Error al recalcular duraciones', 500);
  }
}

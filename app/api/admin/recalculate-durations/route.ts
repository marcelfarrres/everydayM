import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { probeVideo } from '@/lib/server/ffmpeg';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ExerciseRowSummary {
  id: string;
  title: string;
  video_url: string;
  duration_seconds: number;
}

export async function POST(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('exercises')
      .select('id, title, video_url, duration_seconds')
      .order('id', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as ExerciseRowSummary[];
    const results: Array<{
      id: string;
      title: string;
      previousDuration: number;
      newDuration: number | null;
      status: 'updated' | 'unchanged' | 'error';
      error?: string;
    }> = [];

    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      if (!row.video_url) {
        failed += 1;
        results.push({
          id: row.id,
          title: row.title,
          previousDuration: row.duration_seconds,
          newDuration: null,
          status: 'error',
          error: 'Sin URL de vídeo',
        });
        continue;
      }

      try {
        const probe = await probeVideo(row.video_url);
        const newDuration = probe.durationRounded;

        if (newDuration !== row.duration_seconds) {
          const { error: updateErr } = await supabaseAdmin
            .from('exercises')
            .update({ duration_seconds: newDuration })
            .eq('id', row.id);

          if (updateErr) {
            throw new Error(updateErr.message);
          }
          updated += 1;
          results.push({
            id: row.id,
            title: row.title,
            previousDuration: row.duration_seconds,
            newDuration,
            status: 'updated',
          });
        } else {
          results.push({
            id: row.id,
            title: row.title,
            previousDuration: row.duration_seconds,
            newDuration,
            status: 'unchanged',
          });
        }
      } catch (probeErr: unknown) {
        failed += 1;
        results.push({
          id: row.id,
          title: row.title,
          previousDuration: row.duration_seconds,
          newDuration: null,
          status: 'error',
          error:
            probeErr instanceof Error
              ? probeErr.message
              : 'No se pudo leer la duración con ffprobe',
        });
      }
    }

    return NextResponse.json({
      total: rows.length,
      updated,
      failed,
      results,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al recalcular duraciones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

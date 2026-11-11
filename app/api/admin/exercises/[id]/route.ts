import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import {
  extractStorageObjectPath,
  validateExerciseMetadata,
} from '@/lib/server/exerciseMetadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as unknown;
    const validated = validateExerciseMetadata(body);

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('exercises')
      .update({
        title: validated.title,
        type: validated.type,
        difficulty: validated.difficulty,
        muscle: validated.muscle,
        muscles: validated.muscles,
        equipment: validated.equipment,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ exercise: data });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al actualizar el ejercicio';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const { id } = await ctx.params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('exercises')
      .select('id, video_url')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: fetchError?.message ?? 'Ejercicio no encontrado' },
        { status: 404 },
      );
    }

    const storagePath = extractStorageObjectPath(
      typeof existing.video_url === 'string' ? existing.video_url : '',
    );

    const { error: deleteRowError } = await supabaseAdmin
      .from('exercises')
      .delete()
      .eq('id', id);

    if (deleteRowError) {
      return NextResponse.json(
        { error: deleteRowError.message },
        { status: 400 },
      );
    }

    let storageRemoved = false;
    if (storagePath) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('workout-videos')
        .remove([storagePath]);
      storageRemoved = !storageError;
    }

    return NextResponse.json({
      deleted: true,
      id,
      storagePath,
      storageRemoved,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al eliminar el ejercicio';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

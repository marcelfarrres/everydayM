import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = guardStudioApi(req);
  if (denied) return denied;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('exercises')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ exercises: data ?? [] });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al obtener ejercicios';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

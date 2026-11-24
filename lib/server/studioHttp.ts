import 'server-only';
import { NextResponse } from 'next/server';
import { CatalogNotFoundError } from '@/lib/server/catalog';

/** JSON error response for the Studio API: "not found" becomes 404, the rest `status`. */
export function studioErrorResponse(err: unknown, fallback: string, status = 400): NextResponse {
  if (err instanceof CatalogNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

import type { StudioProgressEvent } from '@/types/studio';

/** Thrown when the LAN session expired: the page sends the user back to the PIN screen. */
export class StudioAuthError extends Error {
  constructor() {
    super('PIN requerido');
    this.name = 'StudioAuthError';
  }
}

/** fetch + JSON for the Studio API; throws the server's Spanish message on failure. */
export async function studioJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new StudioAuthError();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Error HTTP ${res.status}`);
  }
  return data;
}

export function jsonBody(method: 'PATCH' | 'POST', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/**
 * Send a file as the raw request body with its details in x-studio-metadata. With
 * `onProgress`, asks for NDJSON progress and resolves with the final `done` event.
 */
export async function uploadFile<T>(
  url: string,
  file: File,
  metadata: unknown,
  onProgress?: (event: StudioProgressEvent) => void,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };
  if (metadata !== undefined) {
    headers['x-studio-metadata'] = encodeURIComponent(JSON.stringify(metadata));
  }
  if (onProgress) headers['x-studio-stream'] = '1';

  const res = await fetch(url, { method: 'POST', headers, body: file });
  if (res.status === 401) throw new StudioAuthError();

  if (!onProgress || !res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Error HTTP ${res.status}`);
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StudioProgressEvent;
      if (event.phase === 'error') throw new Error(event.error ?? 'Error al procesar el archivo');
      onProgress(event);
      if (event.phase === 'done') return event as unknown as T;
    }
  }
  throw new Error('La conexión se cortó antes de terminar.');
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** 75 -> "1:15", 42 -> "42 s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function titleFromFilename(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

/** Accent- and case-insensitive text for searching. */
export function searchable(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function talkCountLabel(count: number): string {
  if (count === 0) return 'Sin vídeo hablado';
  return count === 1 ? '1 vídeo hablado' : `${count} vídeos hablados`;
}

import 'server-only';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerTempFilePath } from '@/lib/server/ffmpeg';

/*
 * Uploads to the Studio arrive as the raw file in the request body (never multipart, so a
 * 1 GB .MOV is never held in memory) with its details as URI-encoded JSON in the
 * `x-studio-metadata` header. Add `x-studio-stream: 1` to get NDJSON progress events.
 */

export interface ReceivedUpload {
  inputPath: string;
  sizeBytes: number;
  /** Parsed x-studio-metadata header, or undefined when it was not sent. */
  rawMetadata: unknown;
  cleanup: () => Promise<void>;
}

export function readMetadataHeader(req: NextRequest): unknown {
  const header = req.headers.get('x-studio-metadata');
  if (!header) return undefined;
  try {
    return JSON.parse(decodeURIComponent(header)) as unknown;
  } catch {
    throw new Error('La cabecera x-studio-metadata no es JSON válido.');
  }
}

/** Stream the request body to a temporary file. */
export async function receiveStudioUpload(
  req: NextRequest,
  ext: string,
): Promise<ReceivedUpload> {
  const rawMetadata = readMetadataHeader(req);
  if (!req.body) {
    throw new Error('El cuerpo de la petición está vacío.');
  }

  const inputPath = await createServerTempFilePath(ext);
  const cleanup = async () => {
    await fs.rm(inputPath, { force: true }).catch(() => {});
  };

  try {
    const webStream = req.body as unknown as NodeWebReadableStream<Uint8Array>;
    await pipeline(Readable.fromWeb(webStream), createWriteStream(inputPath));
    const stat = await fs.stat(inputPath);
    if (stat.size === 0) {
      throw new Error('El archivo recibido está vacío.');
    }
    return { inputPath, sizeBytes: stat.size, rawMetadata, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export function wantsProgressStream(req: NextRequest): boolean {
  return req.headers.get('x-studio-stream') === '1';
}

type SendEvent = (payload: Record<string, unknown>) => void;

/**
 * Run `work` and answer with NDJSON progress lines. `work` sends its own phases and returns
 * the payload of the final `done` event; a thrown error becomes an `error` event.
 */
export function progressStreamResponse(
  work: (send: SendEvent) => Promise<Record<string, unknown>>,
  fallbackError: string,
): NextResponse {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SendEvent = (payload) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      try {
        const result = await work(send);
        send({ phase: 'done', ...result });
      } catch (err: unknown) {
        send({ phase: 'error', error: err instanceof Error ? err.message : fallbackError });
      } finally {
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

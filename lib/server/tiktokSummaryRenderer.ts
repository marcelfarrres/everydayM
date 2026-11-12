import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { createServerTempFilePath, probeVideo } from '@/lib/server/ffmpeg';
import type { Exercise, RoutineMeta } from '@/types/workout';

const execFileAsync = promisify(execFile);

const MAX_SOURCE_DOWNLOAD_BYTES = 80 * 1024 * 1024; // 80 MB safety cap per clip
const DOWNLOAD_TIMEOUT_MS = 25_000;

export interface RenderSummaryOptions {
  meta: RoutineMeta;
  handle?: string;
}

export interface RenderSummaryResult {
  outputPath: string;
  sizeBytes: number;
  durationSeconds: number;
  cleanup: () => Promise<void>;
}

/**
 * Enforces Studio security gate: returns 404 NextResponse unless
 * STUDIO_ENABLED === 'true' AND request comes from localhost/127.0.0.1.
 */
export function assertStudioRequest(req: NextRequest): NextResponse | null {
  return guardStudioApi(req);
}

/**
 * Sanitizes text for FFmpeg drawtext filter so no special filter characters
 * (colons, quotes, backslashes, semicolons, brackets) can break the filtergraph.
 */
function sanitizeOverlayText(raw: string, maxLen = 38): string {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[:;\\'"[\]%,=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'EVERYDAYM';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Validates that a clip URL belongs to the configured Supabase Storage host
 * or localhost to prevent SSRF.
 */
function isAllowedVideoUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const allowedHost = new URL(supabaseUrl).hostname.toLowerCase();
      if (hostname === allowedHost || hostname.endsWith('.supabase.co')) {
        return true;
      }
    }

    return hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

async function downloadClipToTemp(
  url: string,
  cleanupPaths: string[],
): Promise<string | null> {
  if (!isAllowedVideoUrl(url)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      return null;
    }

    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_SOURCE_DOWNLOAD_BYTES) {
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    if (
      arrayBuf.byteLength === 0 ||
      arrayBuf.byteLength > MAX_SOURCE_DOWNLOAD_BYTES
    ) {
      return null;
    }

    const tempPath = await createServerTempFilePath('mp4');
    cleanupPaths.push(tempPath);
    await fs.writeFile(tempPath, Buffer.from(arrayBuf));
    return tempPath;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function createFallbackSourceVideo(
  cleanupPaths: string[],
): Promise<string> {
  const fallbackPath = await createServerTempFilePath('mp4');
  cleanupPaths.push(fallbackPath);

  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=#080b09:s=1080x1920:r=30:d=4',
    '-vf',
    'drawbox=x=0:y=0:w=1080:h=1920:color=#0d1610@0.65:t=fill,drawbox=x=60:y=260:w=960:h=6:color=#22c55e@0.8:t=fill,drawbox=x=60:y=1540:w=960:h=6:color=#22c55e@0.8:t=fill,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-an',
    fallbackPath,
  ];

  await execFileAsync('ffmpeg', args, {
    maxBuffer: 15 * 1024 * 1024,
    windowsHide: true,
  });

  return fallbackPath;
}

interface SegmentSpec {
  inputPath: string;
  seekSeconds: number;
  durationSeconds: number;
  topTag: string;
  headline: string;
  subline: string;
  footerTag: string;
  progressRatio: number; // 0..1
}

function buildOverlayFilterGraph(
  spec: SegmentSpec,
  includeText: boolean,
): string {
  const progressWidth = Math.max(
    40,
    Math.min(936, Math.round(936 * spec.progressRatio)),
  );

  const baseBoxes = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    'fps=30',
    // Top safe-zone glass bar (below top 12% = y:235)
    'drawbox=x=56:y=235:w=968:h=110:color=#080b09@0.78:t=fill',
    'drawbox=x=56:y=235:w=968:h=4:color=#22c55e@0.95:t=fill',
    // Bottom safe-zone card (above bottom 20% = y:1230..1510)
    'drawbox=x=56:y=1230:w=968:h=275:color=#080b09@0.84:t=fill',
    'drawbox=x=56:y=1230:w=968:h=5:color=#4ade80@0.95:t=fill',
    // Progress track & active neon bar
    'drawbox=x=72:y=1468:w=936:h=14:color=#1a261e@0.95:t=fill',
    `drawbox=x=72:y=1468:w=${progressWidth}:h=14:color=#22c55e@1.0:t=fill`,
  ];

  if (includeText) {
    const topTag = sanitizeOverlayText(spec.topTag, 36).toUpperCase();
    const headline = sanitizeOverlayText(spec.headline, 28).toUpperCase();
    const subline = sanitizeOverlayText(spec.subline, 40).toUpperCase();
    const footerTag = sanitizeOverlayText(spec.footerTag, 36).toUpperCase();

    baseBoxes.push(
      `drawtext=font='Arial':text='${topTag}':fontcolor=#4ade80:fontsize=30:x=84:y=275`,
      `drawtext=font='Arial':text='${headline}':fontcolor=white:fontsize=50:x=84:y=1265`,
      `drawtext=font='Arial':text='${subline}':fontcolor=#4ade80:fontsize=32:x=84:y=1338`,
      `drawtext=font='Arial':text='${footerTag}':fontcolor=#d4d4d8:fontsize=26:x=84:y=1398`,
    );
  }

  baseBoxes.push('format=yuv420p');
  return baseBoxes.join(',');
}

async function encodeSummarySegment(
  spec: SegmentSpec,
  cleanupPaths: string[],
): Promise<string> {
  const segPath = await createServerTempFilePath('mp4');
  cleanupPaths.push(segPath);

  const runWithText = async (withText: boolean) => {
    const vf = buildOverlayFilterGraph(spec, withText);
    const args = [
      '-y',
      '-ss',
      spec.seekSeconds.toFixed(2),
      '-t',
      spec.durationSeconds.toFixed(2),
      '-i',
      spec.inputPath,
      '-vf',
      vf,
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-an',
      segPath,
    ];

    await execFileAsync('ffmpeg', args, {
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
  };

  try {
    await runWithText(true);
  } catch {
    // Fallback without drawtext if fontconfig is unavailable in environment
    await runWithText(false);
  }

  return segPath;
}

/**
 * Renders a 12-15s 1080x1920 30fps H.264 vertical TikTok summary MP4 from RoutineMeta.
 */
export async function renderTiktokSummaryMp4(
  options: RenderSummaryOptions,
): Promise<RenderSummaryResult> {
  const { meta } = options;
  const cleanHandle = sanitizeOverlayText(
    options.handle?.trim() || '@everydaym',
    24,
  );
  const cleanupPaths: string[] = [];

  try {
    const circuitExercises: Exercise[] =
      Array.isArray(meta.circuit) && meta.circuit.length > 0
        ? meta.circuit.slice(0, 6)
        : [];

    // Download unique clip URLs in parallel
    const uniqueUrls = new Set<string>();
    if (meta.background?.video_url) {
      uniqueUrls.add(meta.background.video_url);
    }
    for (const ex of circuitExercises) {
      if (ex.video_url) {
        uniqueUrls.add(ex.video_url);
      }
    }

    const urlToFileMap = new Map<string, string>();
    await Promise.all(
      Array.from(uniqueUrls).map(async (url) => {
        const downloaded = await downloadClipToTemp(url, cleanupPaths);
        if (downloaded) {
          urlToFileMap.set(url, downloaded);
        }
      }),
    );

    let fallbackSource: string | null = null;
    const ensureFallback = async (): Promise<string> => {
      if (!fallbackSource) {
        fallbackSource = await createFallbackSourceVideo(cleanupPaths);
      }
      return fallbackSource;
    };

    const resolveClipPath = async (url?: string): Promise<string> => {
      if (url && urlToFileMap.has(url)) {
        return urlToFileMap.get(url)!;
      }
      const firstDownloaded = urlToFileMap.values().next().value;
      if (firstDownloaded) {
        return firstDownloaded;
      }
      return ensureFallback();
    };

    const totalMinutes = Math.max(1, Math.round((meta.totalSeconds || 1800) / 60));
    const totalSeries = Math.max(
      1,
      (meta.rounds || 3) * (meta.exercisesPerRound || Math.max(1, circuitExercises.length)),
    );
    const focusTitle = meta.focusLabel || 'ENTRENAMIENTO COMPLETO';

    const bgPath = await resolveClipPath(
      meta.background?.video_url ?? circuitExercises[0]?.video_url,
    );

    const cutCount = Math.max(1, circuitExercises.length);
    // Target ~8.4s across all exercise cuts so total video = 2.4s (hook) + ~8.4s (cuts) + 2.6s (outro) = ~13.4s
    const cutDuration = Number(
      Math.min(2.8, Math.max(1.35, 8.4 / cutCount)).toFixed(2),
    );

    const segmentSpecs: SegmentSpec[] = [];

    // 1. Hook segment (2.4s)
    segmentSpecs.push({
      inputPath: bgPath,
      seekSeconds: 0,
      durationSeconds: 2.4,
      topTag: `EVERYDAYM  ${cleanHandle}`,
      headline: `${totalMinutes} MIN  ${focusTitle}`,
      subline: `${meta.rounds || 3} RONDAS  X  ${meta.exercisesPerRound || cutCount} EJERCICIOS`,
      footerTag: `NIVEL ${meta.difficulty || 6}/10  ·  SLOT ${meta.slotSeconds || 50}S`,
      progressRatio: 0.12,
    });

    // 2. Rapid Exercise Cuts (~8.4s total)
    if (circuitExercises.length > 0) {
      for (let i = 0; i < circuitExercises.length; i++) {
        const ex = circuitExercises[i];
        const clipPath = await resolveClipPath(ex.video_url);
        const clipDur = Number(ex.duration_seconds) || 30;
        const seekSeconds = clipDur > cutDuration + 2 ? 1.2 : 0;

        segmentSpecs.push({
          inputPath: clipPath,
          seekSeconds,
          durationSeconds: cutDuration,
          topTag: `EJERCICIO 0${i + 1} DE 0${circuitExercises.length}  ·  ${cleanHandle}`,
          headline: ex.title || `EJERCICIO ${i + 1}`,
          subline: `ENFOQUE  ${ex.muscle || 'FULL BODY'}`,
          footerTag: `${meta.rounds || 3} RONDAS  ·  SLOT ${meta.slotSeconds || 50}S`,
          progressRatio: Math.min(
            0.88,
            0.2 + ((i + 1) / circuitExercises.length) * 0.65,
          ),
        });
      }
    } else {
      segmentSpecs.push({
        inputPath: bgPath,
        seekSeconds: 0,
        durationSeconds: 8.4,
        topTag: `CIRCUITO ACTIVO  ·  ${cleanHandle}`,
        headline: focusTitle,
        subline: `${totalSeries} SERIES TOTALES`,
        footerTag: `DURACION ${totalMinutes} MINUTOS`,
        progressRatio: 0.65,
      });
    }

    // 3. Outro / Muscle & CTA segment (2.6s)
    const primaryMusclesLabel =
      meta.muscles
        ?.filter((m) => m.role === 'primary')
        .slice(0, 3)
        .map((m) => m.id.toUpperCase())
        .join(' + ') || 'CUERPO COMPLETO';

    segmentSpecs.push({
      inputPath: bgPath,
      seekSeconds: 0,
      durationSeconds: 2.6,
      topTag: `RESUMEN FINAL  ·  ${cleanHandle}`,
      headline: `GUARDA ESTA RUTINA`,
      subline: `${totalMinutes} MIN  ·  ${totalSeries} SERIES COMPLETAS`,
      footerTag: `MUSCULOS  ${primaryMusclesLabel}`,
      progressRatio: 1.0,
    });

    // Encode each segment sequentially
    const segmentFiles: string[] = [];
    for (const spec of segmentSpecs) {
      const segFile = await encodeSummarySegment(spec, cleanupPaths);
      segmentFiles.push(segFile);
    }

    // Create FFmpeg concat list file
    const concatDir = path.join(os.tmpdir(), 'everydaym-studio');
    await fs.mkdir(concatDir, { recursive: true });
    const concatListPath = path.join(
      concatDir,
      `concat-${crypto.randomUUID()}.txt`,
    );
    cleanupPaths.push(concatListPath);

    const concatBody = segmentFiles
      .map((filePath) => `file '${filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(concatListPath, concatBody, 'utf8');

    const finalOutputPath = await createServerTempFilePath('mp4');

    const concatArgs = [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-r',
      '30',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      finalOutputPath,
    ];

    await execFileAsync('ffmpeg', concatArgs, {
      maxBuffer: 25 * 1024 * 1024,
      windowsHide: true,
    });

    const stat = await fs.stat(finalOutputPath);
    let finalDuration = 13;
    try {
      const probed = await probeVideo(finalOutputPath);
      if (probed.durationRounded > 0) {
        finalDuration = probed.durationRounded;
      }
    } catch {
      finalDuration = Math.round(
        segmentSpecs.reduce((acc, s) => acc + s.durationSeconds, 0),
      );
    }

    return {
      outputPath: finalOutputPath,
      sizeBytes: stat.size,
      durationSeconds: finalDuration,
      cleanup: async () => {
        await fs.rm(finalOutputPath, { force: true }).catch(() => {});
      },
    };
  } finally {
    await Promise.all(
      cleanupPaths.map((p) => fs.rm(p, { force: true }).catch(() => {})),
    );
  }
}

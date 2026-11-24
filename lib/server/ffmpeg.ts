import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/** Width of the original kept for exports, of the lite copy the app plays, and of posters. */
const ORIGINAL_WIDTH = 1080;
const LITE_WIDTH = 720;
const POSTER_WIDTH = 480;
/** Poster target: ~30 KB. Quality steps down until it fits (or the last step is used). */
const POSTER_MAX_BYTES = 40 * 1024;
const POSTER_QUALITIES = [72, 60, 50];
/** EBU R128 single pass to about -16 LUFS: talks and music sound equally loud. */
const LOUDNORM_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11';

const hdrChain = (width: number) =>
  `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,scale=${width}:-2,format=yuv420p`;
// Homebrew's ffmpeg ships without zscale: convert the BT.2020 colours to BT.709 instead of a
// full tone-map. iPhone HLG is designed to look right this way on SDR screens.
const hdrFallback = (width: number) =>
  `colorspace=all=bt709:iall=bt2020:irange=tv:range=tv:format=yuv420p,scale=${width}:-2`;
const sdrChain = (width: number) => `scale=${width}:-2,format=yuv420p`;

let zscaleCheck: Promise<boolean> | null = null;
function hasZscale(): Promise<boolean> {
  zscaleCheck ??= execFileAsync('ffmpeg', ['-hide_banner', '-filters'], { windowsHide: true })
    .then(({ stdout }) => /\szscale\s/.test(stdout))
    .catch(() => false);
  return zscaleCheck;
}

interface FfprobeSideData {
  side_data_type?: string;
  rotation?: number | string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  color_transfer?: string;
  color_space?: string;
  color_primaries?: string;
  tags?: {
    rotate?: string;
  };
  side_data_list?: FfprobeSideData[];
}

interface FfprobeFormat {
  duration?: string;
  size?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface VideoProbeInfo {
  durationSeconds: number;
  durationRounded: number;
  width: number;
  height: number;
  rotation: number;
  colorTransfer: string | null;
  isHdr: boolean;
  hasAudio: boolean;
}

export interface TranscodeOptions {
  inputPath: string;
  keepAudio: boolean;
  /** Bring the voice to about -16 LUFS (talks). Only applies when keepAudio is true. */
  normalizeLoudness?: boolean;
  /** Reject outputs this big or bigger (Supabase Free: 50 MB). null/undefined = no limit. */
  maxBytes?: number | null;
}

/** A temporary output file plus what is known about it. */
export interface DerivedFile {
  outputPath: string;
  sizeBytes: number;
  cleanup: () => Promise<void>;
}

export interface TranscodeResult {
  outputPath: string;
  sizeBytes: number;
  durationSeconds: number;
  isHdr: boolean;
  crfUsed: number;
  cleanup: () => Promise<void>;
}

export async function createServerTempFilePath(ext: string): Promise<string> {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'mp4';
  const dir = path.join(os.tmpdir(), 'everydaym-studio');
  await fs.mkdir(dir, { recursive: true });
  const fileName = `clip-${crypto.randomUUID()}.${safeExt}`;
  return path.join(dir, fileName);
}

export async function probeVideo(targetPathOrUrl: string): Promise<VideoProbeInfo> {
  const args = [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    targetPathOrUrl,
  ];

  const { stdout } = await execFileAsync('ffprobe', args, {
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');

  const formatDuration = parsed.format?.duration
    ? Number.parseFloat(parsed.format.duration)
    : Number.NaN;
  const streamDuration = videoStream?.duration
    ? Number.parseFloat(videoStream.duration)
    : Number.NaN;

  const rawDuration = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : Number.isFinite(streamDuration) && streamDuration > 0
      ? streamDuration
      : 0;

  const durationRounded = Math.max(1, Math.round(rawDuration));

  let rotation = 0;
  if (videoStream?.tags?.rotate) {
    const parsedRot = Number.parseInt(videoStream.tags.rotate, 10);
    if (Number.isFinite(parsedRot)) {
      rotation = parsedRot;
    }
  } else if (videoStream?.side_data_list) {
    for (const sd of videoStream.side_data_list) {
      if (sd.rotation !== undefined) {
        const parsedRot = Number.parseInt(String(sd.rotation), 10);
        if (Number.isFinite(parsedRot)) {
          rotation = parsedRot;
          break;
        }
      }
    }
  }

  const colorTransfer = videoStream?.color_transfer?.toLowerCase() ?? null;
  const isHdr =
    colorTransfer === 'arib-std-b67' || colorTransfer === 'smpte2084';

  return {
    durationSeconds: rawDuration,
    durationRounded,
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
    rotation,
    colorTransfer,
    isHdr,
    hasAudio,
  };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
}

async function runFfmpegEncode(params: {
  inputPath: string;
  outputPath: string;
  isHdr: boolean;
  keepAudio: boolean;
  normalizeLoudness: boolean;
  crf: number;
}): Promise<void> {
  const vfChain = !params.isHdr
    ? sdrChain(ORIGINAL_WIDTH)
    : (await hasZscale())
      ? hdrChain(ORIGINAL_WIDTH)
      : hdrFallback(ORIGINAL_WIDTH);

  const args: string[] = ['-y', '-i', params.inputPath, '-map', '0:v:0'];

  if (params.keepAudio) {
    args.push('-map', '0:a:0?');
  }

  args.push(
    '-vf',
    vfChain,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(params.crf),
  );

  if (params.keepAudio) {
    if (params.normalizeLoudness) {
      // loudnorm resamples to 192 kHz internally: bring it back to 48 kHz.
      args.push('-af', LOUDNORM_FILTER, '-ar', '48000');
    }
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', params.outputPath);

  await runFfmpeg(args);
}

export async function transcodeVideoForStudio(
  options: TranscodeOptions,
): Promise<TranscodeResult> {
  const probe = await probeVideo(options.inputPath);
  const outputPath = await createServerTempFilePath('mp4');
  const maxBytes = options.maxBytes ?? null;
  const keepAudio = options.keepAudio && probe.hasAudio;

  // Without a size limit one pass is enough; with one, step the CRF up until it fits.
  const crfCandidates = maxBytes === null ? [24] : [24, 28, 32];
  let crfUsed = 24;
  let sizeBytes = 0;

  try {
    for (const crf of crfCandidates) {
      crfUsed = crf;
      await runFfmpegEncode({
        inputPath: options.inputPath,
        outputPath,
        isHdr: probe.isHdr,
        keepAudio,
        normalizeLoudness: Boolean(options.normalizeLoudness),
        crf,
      });

      const stat = await fs.stat(outputPath);
      sizeBytes = stat.size;

      if (maxBytes === null || sizeBytes < maxBytes) {
        break;
      }
    }

    if (maxBytes !== null && sizeBytes >= maxBytes) {
      await fs.rm(outputPath, { force: true });
      throw new Error(
        `El vídeo comprimido supera el límite de ${Math.round(maxBytes / (1024 * 1024))} MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB incluso con CRF ${crfUsed}).`,
      );
    }

    const outProbe = await probeVideo(outputPath);
    const finalDuration =
      outProbe.durationRounded > 0
        ? outProbe.durationRounded
        : probe.durationRounded;

    return {
      outputPath,
      sizeBytes,
      durationSeconds: finalDuration,
      isHdr: probe.isHdr,
      crfUsed,
      cleanup: async () => {
        await fs.rm(outputPath, { force: true });
      },
    };
  } catch (err) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw err;
  }
}

async function asDerivedFile(outputPath: string): Promise<DerivedFile> {
  const stat = await fs.stat(outputPath);
  return {
    outputPath,
    sizeBytes: stat.size,
    cleanup: async () => {
      await fs.rm(outputPath, { force: true });
    },
  };
}

/**
 * The copy the app plays: 720 px wide H.264 with +faststart. Capped CRF (26, at most
 * ~1.6 Mbit/s) lands around 8–12 MB per minute of footage. Made from the SDR original, so
 * no HDR handling is needed here. Audio, if kept, is copied as is (already AAC, normalised).
 */
export async function createLiteVideo(params: {
  sourcePath: string;
  keepAudio: boolean;
}): Promise<DerivedFile> {
  const outputPath = await createServerTempFilePath('mp4');
  const args = ['-y', '-i', params.sourcePath, '-map', '0:v:0'];
  if (params.keepAudio) args.push('-map', '0:a:0?');
  args.push(
    '-vf',
    sdrChain(LITE_WIDTH),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-profile:v',
    'high',
    '-crf',
    '26',
    '-maxrate',
    '1600k',
    '-bufsize',
    '3200k',
  );
  args.push(...(params.keepAudio ? ['-c:a', 'copy'] : ['-an']));
  args.push('-movflags', '+faststart', outputPath);

  try {
    await runFfmpeg(args);
    return await asDerivedFile(outputPath);
  } catch (err) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw err;
  }
}

/** A still from the middle of the clip: WebP, 480 px wide, about 30 KB. */
export async function createPosterImage(params: {
  sourcePath: string;
  durationSeconds: number;
}): Promise<DerivedFile> {
  const framePath = await createServerTempFilePath('png');
  const outputPath = await createServerTempFilePath('webp');
  const middle = Math.max(0, params.durationSeconds / 2);

  const grabFrame = (atSeconds: number) =>
    runFfmpeg([
      '-y',
      '-ss',
      atSeconds.toFixed(2),
      '-i',
      params.sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${POSTER_WIDTH}:-2`,
      framePath,
    ]);

  try {
    await grabFrame(middle);
    // Seeking past the last frame writes nothing: fall back to the first frame.
    const grabbed = await fs.stat(framePath).then((s) => s.size > 0).catch(() => false);
    if (!grabbed) await grabFrame(0);

    let webp: Buffer | null = null;
    for (const quality of POSTER_QUALITIES) {
      webp = await sharp(framePath)
        .resize({ width: POSTER_WIDTH, withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer();
      if (webp.length <= POSTER_MAX_BYTES) break;
    }
    if (!webp) throw new Error('No se pudo crear la miniatura.');
    await fs.writeFile(outputPath, webp);
    return await asDerivedFile(outputPath);
  } catch (err) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await fs.rm(framePath, { force: true }).catch(() => {});
  }
}

export interface AudioTranscodeResult extends DerivedFile {
  durationSeconds: number;
}

/** A music track for the player: AAC ~96 kbit/s in .m4a, loudness evened out between tracks. */
export async function transcodeAudioTrack(inputPath: string): Promise<AudioTranscodeResult> {
  const probe = await probeVideo(inputPath);
  if (!probe.hasAudio) {
    throw new Error('El archivo no tiene pista de audio.');
  }

  const outputPath = await createServerTempFilePath('m4a');
  try {
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-map',
      '0:a:0',
      '-af',
      LOUDNORM_FILTER,
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
    const outProbe = await probeVideo(outputPath);
    const derived = await asDerivedFile(outputPath);
    return {
      ...derived,
      durationSeconds: outProbe.durationRounded || probe.durationRounded,
    };
  } catch (err) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw err;
  }
}

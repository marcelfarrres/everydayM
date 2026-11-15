import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024; // 50 MB limit for Supabase Free

const HDR_VF_CHAIN =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,scale=1080:-2,format=yuv420p';
// Homebrew's ffmpeg ships without zscale: convert the BT.2020 colours to BT.709 instead of a
// full tone-map. iPhone HLG is designed to look right this way on SDR screens.
const HDR_VF_FALLBACK = 'colorspace=all=bt709:iall=bt2020:irange=tv:range=tv:format=yuv420p,scale=1080:-2';
const SDR_VF_CHAIN = 'scale=1080:-2,format=yuv420p';

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

async function runFfmpegEncode(params: {
  inputPath: string;
  outputPath: string;
  isHdr: boolean;
  keepAudio: boolean;
  crf: number;
}): Promise<void> {
  const vfChain = !params.isHdr ? SDR_VF_CHAIN : (await hasZscale()) ? HDR_VF_CHAIN : HDR_VF_FALLBACK;

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
    args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', params.outputPath);

  await execFileAsync('ffmpeg', args, {
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function transcodeVideoForStudio(
  options: TranscodeOptions,
): Promise<TranscodeResult> {
  const probe = await probeVideo(options.inputPath);
  const outputPath = await createServerTempFilePath('mp4');

  const crfCandidates = [24, 28, 32];
  let crfUsed = 24;
  let sizeBytes = 0;

  try {
    for (const crf of crfCandidates) {
      crfUsed = crf;
      await runFfmpegEncode({
        inputPath: options.inputPath,
        outputPath,
        isHdr: probe.isHdr,
        keepAudio: options.keepAudio && probe.hasAudio,
        crf,
      });

      const stat = await fs.stat(outputPath);
      sizeBytes = stat.size;

      if (sizeBytes < MAX_OUTPUT_BYTES) {
        break;
      }
    }

    if (sizeBytes >= MAX_OUTPUT_BYTES) {
      await fs.rm(outputPath, { force: true });
      throw new Error(
        `El vídeo comprimido supera el límite de 50 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB incluso con CRF ${crfUsed}).`,
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

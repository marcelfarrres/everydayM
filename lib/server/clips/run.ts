import 'server-only';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveFfmpegBin } from '@/lib/server/ffmpegBin.mjs';

/*
 * FFmpeg plumbing shared by every clip part: the call itself, the encoder and the one set of
 * output settings that lets parts be joined later without re-encoding.
 *
 * Every part has the same streams: H.264 1080×1920 at 30 fps, yuv420p, and AAC stereo 48 kHz.
 * Parts with no voice get a silent track, so a talk (with voice) can sit between them and the
 * concat demuxer still copies everything.
 */

export const execFileAsync = promisify(execFile);

export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const AUDIO_RATE = 48000;

/** Scale and crop any clip to fill the vertical frame. */
export const COVER = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`;

// Runtime paths: tell the bundler not to trace them (it would ship the whole project).
export const join = (...parts: string[]) => path.join(/* turbopackIgnore: true */ ...parts);

/** No single FFmpeg call may hang the queue: the longest (a 40 min mix) takes a few minutes. */
export const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

export async function ff(args: string[]): Promise<void> {
  await execFileAsync(resolveFfmpegBin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    timeout: FFMPEG_TIMEOUT_MS,
  });
}

let encoderCheck: Promise<boolean> | null = null;

/** Apple's hardware encoder when there is one (≈10× faster), otherwise x264. */
export async function pickEncoder(long: boolean): Promise<string[]> {
  encoderCheck ??= execFileAsync(resolveFfmpegBin('ffmpeg'), ['-hide_banner', '-encoders'], { windowsHide: true })
    .then(({ stdout }) => /h264_videotoolbox/.test(stdout))
    .catch(() => false);
  // ~2.4 MB/min for the full routine (a 30 min video ≈ 700 MB), crisper for short clips.
  const [rate, crf] = long ? ['3200k', '24'] : ['6M', '20'];
  return (await encoderCheck)
    ? ['-c:v', 'h264_videotoolbox', '-b:v', rate, '-profile:v', 'high']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-profile:v', 'high'];
}

/** AAC settings of every part and of the final mix. */
export const AUDIO_OUT = ['-c:a', 'aac', '-b:a', '160k', '-ar', String(AUDIO_RATE), '-ac', '2'];

/** Turns any voice into the parts' format: 48 kHz stereo, padded with silence to the end. */
export const VOICE_FORMAT = `aresample=${AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,apad`;

function countInputs(args: readonly string[]): number {
  return args.filter((a) => a === '-i').length;
}

/**
 * Render one part. `graph` must produce `[out]` (video). `voice` is the label of an audio
 * stream the graph produces (already in VOICE_FORMAT); without it the part gets silence.
 */
export async function renderPart(o: {
  inputs: string[];
  graph: string;
  seconds: number;
  out: string;
  encoder: string[];
  voice?: string;
}): Promise<void> {
  const args = [...o.inputs];
  let audioMap: string;
  if (o.voice) {
    audioMap = o.voice;
  } else {
    audioMap = `${countInputs(o.inputs)}:a`;
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_RATE}`);
  }
  await ff([
    ...args,
    '-filter_complex',
    o.graph,
    '-map',
    '[out]',
    '-map',
    audioMap,
    '-t',
    o.seconds.toFixed(3),
    '-r',
    String(FPS),
    '-pix_fmt',
    'yuv420p',
    ...o.encoder,
    ...AUDIO_OUT,
    o.out,
  ]);
}

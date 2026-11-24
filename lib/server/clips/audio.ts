import 'server-only';
import { planMusicBed } from '@/lib/clips/musicBed';
import { AUDIO_OUT, AUDIO_RATE, FFMPEG_TIMEOUT_MS, execFileAsync, ff } from '@/lib/server/clips/run';
import { resolveFfmpegBin } from '@/lib/server/ffmpegBin.mjs';

/*
 * The final pass over the joined parts. The video stream is always copied; only the sound changes.
 *  - Short clips: no music (Marcel adds a sound in TikTok). With a voice, it is brought to about
 *    −14 LUFS (TikTok's level); without one the silent track is copied as is.
 *  - Full routine: a music bed from the catalog's enabled tracks, crossfaded one into the next
 *    and looped to the video's length, ducked under the voice (sidechaincompress, ≈ −12 dB) and
 *    the whole mix normalised to about −14 LUFS (loudnorm, two passes: measure, then one gain).
 */

const TARGET = { I: -14, TP: -1.5, LRA: 11 };
const FMT = `aresample=${AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

export interface MusicSource {
  file: string;
  seconds: number;
}

/** The filter graph of the music mix, ending in [premix]. Input 0 is the joined video; music inputs follow. */
export function musicMixGraph(count: number, crossfade: number, seconds: number): string {
  const parts: string[] = [];
  for (let k = 0; k < count; k++) parts.push(`[${k + 1}:a]${FMT}[m${k}]`);
  let last = 'm0';
  for (let k = 1; k < count; k++) {
    const next = `x${k}`;
    parts.push(
      crossfade > 0
        ? `[${last}][m${k}]acrossfade=d=${crossfade.toFixed(2)}:c1=tri:c2=tri[${next}]`
        : `[${last}][m${k}]concat=n=2:v=0:a=1[${next}]`,
    );
    last = next;
  }
  const fadeOut = Math.max(0, seconds - 3);
  parts.push(
    `[${last}]atrim=0:${seconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=1.5,afade=t=out:st=${fadeOut.toFixed(3)}:d=3[bed]`,
    `[0:a]${FMT},asplit=2[voice][key]`,
    // The bed drops ≈ 12 dB (to ~25 %) while the voice talks, ~20 ms attack, ~450 ms release.
    // Measured: with FFmpeg's curve a threshold this low is what gives that depth for a voice
    // around −16 LUFS (0.02 only took off ~1 dB).
    `[bed][key]sidechaincompress=threshold=0.005:ratio=20:attack=20:release=450[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[premix]`,
  );
  return parts.join(';');
}

interface Measured {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/**
 * First loudnorm pass: measure what the graph produces at [premix]. Two passes (measure, then
 * one linear gain) keep a short voice after a silent intro at the target; one dynamic pass left
 * an intro + talk clip near −31 LUFS. null when there is nothing to measure (silence).
 */
async function measure(inputs: string[], graph: string): Promise<Measured | null> {
  const { stderr } = await execFileAsync(
    resolveFfmpegBin('ffmpeg'),
    [
      '-hide_banner',
      '-nostdin',
      ...inputs,
      '-filter_complex',
      `${graph};[premix]loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json[m]`,
      '-map',
      '[m]',
      '-f',
      'null',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: FFMPEG_TIMEOUT_MS },
  );
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr)?.[0];
  if (!json) return null;
  const m = JSON.parse(json) as Measured;
  return Number.isFinite(Number(m.input_i)) && Number(m.input_i) > -70 ? m : null;
}

function loudnorm(m: Measured): string {
  return `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

/** Copy the video and give the clip its final sound. */
export async function finishAudio(o: {
  input: string;
  output: string;
  seconds: number;
  voice: boolean;
  music: MusicSource[]; // [] = no music
}): Promise<void> {
  const bed = planMusicBed(
    o.music.map((m) => m.seconds),
    o.seconds,
  );
  if (bed.order.length === 0 && !o.voice) {
    // Silence only: nothing to mix or level.
    await ff(['-i', o.input, '-map', '0:v', '-map', '0:a', '-c', 'copy', '-movflags', '+faststart', o.output]);
    return;
  }
  const inputs = ['-i', o.input, ...bed.order.flatMap((i) => ['-i', o.music[i].file])];
  const graph = bed.order.length > 0 ? musicMixGraph(bed.order.length, bed.crossfade, o.seconds) : `[0:a]${FMT}[premix]`;
  const measured = await measure(inputs, graph);
  await ff([
    ...inputs,
    '-filter_complex',
    `${graph};[premix]${measured ? `${loudnorm(measured)},` : ''}aresample=${AUDIO_RATE}[mix]`,
    '-map',
    '0:v',
    '-map',
    '[mix]',
    '-c:v',
    'copy',
    ...AUDIO_OUT,
    '-t',
    o.seconds.toFixed(3),
    '-movflags',
    '+faststart',
    o.output,
  ]);
}

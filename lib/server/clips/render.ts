import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import { probeVideo } from '@/lib/server/ffmpeg';
import { readCatalog } from '@/lib/server/catalog';
import { finishAudio, type MusicSource } from '@/lib/server/clips/audio';
import { renderCarousel } from '@/lib/server/clips/carousel';
import type { Ctx, SourceInfo } from '@/lib/server/clips/context';
import { hasVoice, mediaFor, partsFor, type ClipSpec } from '@/lib/server/clips/recipes';
import { execFileAsync, ff, join, pickEncoder } from '@/lib/server/clips/run';
import { isAllowedMediaUrl, localSources, trimSourceCache } from '@/lib/server/clips/sources';

/*
 * One render, start to end: gather the media (from disk or the download cache), render each
 * part with the same settings, join them without re-encoding, then the final sound pass.
 * Writes only to its scratch folder and to the target paths it is given.
 */

export interface RenderTarget {
  video: string; // MP4 path (videos)
  slidesDir: string; // folder for the photos (carousel)
  zip: string; // ZIP path (carousel)
}

export interface RenderResult {
  kind: 'video' | 'photos';
  file: string; // the MP4 or the ZIP
  slides: string[]; // photo paths, in order
  notes: string[];
}

export type ProgressFn = (progress: number, step: string) => void;

/** Fisher–Yates with a seeded generator: the same clip and variant shuffle the music the same way. */
function shuffled<T>(list: readonly T[], seed: string): T[] {
  let h = Number.parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16);
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The catalog's enabled music, as local files, shuffled for this clip. [] when there is none. */
async function musicFor(seed: string): Promise<MusicSource[]> {
  const catalog = await readCatalog();
  const tracks = shuffled(
    catalog.music.filter((m) => m.enabled && isAllowedMediaUrl(m.audio_url)),
    seed,
  ).slice(0, 40);
  if (tracks.length === 0) return [];
  const files = await localSources(tracks.map((t) => t.audio_url));
  const out: MusicSource[] = [];
  for (const track of tracks) {
    const file = files.get(track.audio_url);
    if (!file) continue;
    let seconds = Number(track.duration_seconds) || 0;
    if (seconds < 2) seconds = (await probeVideo(file).catch(() => null))?.durationSeconds ?? 0;
    if (seconds >= 2) out.push({ file, seconds });
  }
  return out;
}

export async function renderClip(spec: ClipSpec, target: RenderTarget, onProgress: ProgressFn): Promise<RenderResult> {
  const dir = await fs.mkdtemp(join(os.tmpdir(), 'everydaym-clip-'));
  const notes: string[] = [];
  try {
    onProgress(0.01, 'Reuniendo los vídeos');
    const media = mediaFor(spec);
    const sources = await localSources([...media.videos, ...media.talks], (done, total) =>
      onProgress(0.08 * (done / Math.max(1, total)), `Reuniendo los vídeos · ${done} de ${total}`),
    );
    const info = new Map<string, SourceInfo>();
    await Promise.all(
      media.talks.map(async (url) => {
        const probe = await probeVideo(sources.get(url)!).catch(() => null);
        info.set(url, { seconds: probe?.durationSeconds ?? 0, hasAudio: probe?.hasAudio ?? false });
      }),
    );
    const ctx: Ctx = {
      dir,
      sources,
      info,
      encoder: await pickEncoder(spec.type === 'full'),
      handle: spec.handle,
      meta: spec.meta,
      queue: spec.queue,
      prompt: spec.prompt,
      variant: spec.variant,
      headline: spec.headline,
    };

    if (spec.type === 'carousel') {
      // Photos, not a video: copy them out of the scratch folder and zip them for one download.
      const made = await renderCarousel(ctx, (step) => onProgress(0.5, step));
      await fs.mkdir(target.slidesDir, { recursive: true });
      const names = made.map((_, i) => `everydaym-${String(i + 1).padStart(2, '0')}.jpg`);
      await Promise.all(made.map((f, i) => fs.copyFile(f, join(target.slidesDir, names[i]))));
      onProgress(0.95, 'Comprimiendo las fotos');
      // bsdtar (macOS, Windows 10+) writes a .zip when asked with -a. On Windows, name the system
      // one: a GNU tar from Git Bash may come first on PATH and reads "C:" as a remote host.
      const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
      await execFileAsync(tar, ['-a', '-cf', target.zip, ...names], { cwd: target.slidesDir, windowsHide: true });
      return { kind: 'photos', file: target.zip, slides: names.map((n) => join(target.slidesDir, n)), notes };
    }

    const parts = partsFor(spec);
    if (parts.length === 0) throw new Error('No hay nada que montar.');
    const files = parts.map((_, i) => join(dir, `part${String(i).padStart(3, '0')}.mp4`));
    let done = 0;
    onProgress(0.1, 'Montando el vídeo');
    // 3 parts at a time; raise it if the machine has cores to spare.
    for (let i = 0; i < parts.length; i += 3) {
      await Promise.all(
        parts.slice(i, i + 3).map(async (part, k) => {
          await part.render(ctx, files[i + k]);
          done += 1;
          onProgress(0.1 + 0.78 * (done / parts.length), `Montando el vídeo · parte ${done} de ${parts.length}`);
        }),
      );
    }

    onProgress(0.9, 'Uniendo las partes');
    const list = join(dir, 'parts.txt');
    await fs.writeFile(list, files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const joined = join(dir, 'joined.mp4');
    await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
    const seconds = (await probeVideo(joined)).durationSeconds;

    let music: MusicSource[] = [];
    if (spec.type === 'full') {
      onProgress(0.93, 'Mezclando la música');
      music = await musicFor(`${spec.meta.blocks.flat().map((e) => e.id).join('|')}#${spec.variant}`);
      if (music.length === 0) notes.push('Sin música: el catálogo no tiene pistas activas. Súbelas en «Música».');
    } else {
      onProgress(0.95, 'Ajustando el sonido');
    }
    await finishAudio({ input: joined, output: target.video, seconds, voice: hasVoice(spec), music });
    return { kind: 'video', file: target.video, slides: [], notes };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await trimSourceCache().catch(() => {});
  }
}

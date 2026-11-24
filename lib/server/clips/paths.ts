import 'server-only';
import path from 'node:path';
import { join } from '@/lib/server/clips/run';

/*
 * Where clips live on the Studio computer: `.clips/` in the project (git-ignored).
 *   manifest.json   the queue (see lib/clips/queue.ts)
 *   files/          rendered MP4s, posters, carousel photos and ZIPs
 *   specs/          what each clip was made from, to regenerate it
 *   cache/          downloaded originals, so the same clip is not downloaded twice
 */

export const CLIPS_ROOT = join(process.cwd(), '.clips');
export const FILES_DIR = join(CLIPS_ROOT, 'files');
export const SPECS_DIR = join(CLIPS_ROOT, 'specs');
export const CACHE_DIR = join(CLIPS_ROOT, 'cache');
export const MANIFEST_PATH = join(CLIPS_ROOT, 'manifest.json');

/** Absolute path of a file stored as relative to the clips folder; never outside it. */
export function clipsPath(relative: string): string {
  const resolved = path.resolve(CLIPS_ROOT, relative);
  if (!resolved.startsWith(CLIPS_ROOT + path.sep)) throw new Error('Ruta fuera de la carpeta de clips.');
  return resolved;
}

/** A path inside the clips folder, as stored in the manifest (forward slashes). */
export function relativeToClips(absolute: string): string {
  return path.relative(CLIPS_ROOT, absolute).split(path.sep).join('/');
}

/*
 * Where ffmpeg and ffprobe live. Shared by the Studio (lib/server/ffmpeg.ts), the clip engine
 * (lib/server/clips/) and scripts/migrate-media.mjs, so plain JavaScript with no imports from the app.
 *
 * Order: FFMPEG_PATH / FFPROBE_PATH, then the PATH, then the winget install on Windows
 * (%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin), which is not on the
 * PATH of every shell. A found path is remembered; a miss is not, so installing it later works.
 */

import fs from 'node:fs';
import path from 'node:path';

/** @typedef {'ffmpeg' | 'ffprobe'} FfmpegTool */

/** @type {Map<FfmpegTool, string>} */
const found = new Map();

// Runtime paths: tell the bundler not to trace them.
/** @param {...string} parts */
const join = (...parts) => path.join(/* turbopackIgnore: true */ ...parts);

/** @param {string} file */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** @param {FfmpegTool} tool */
function fileNames(tool) {
  return process.platform === 'win32' ? [`${tool}.exe`, tool] : [tool];
}

/** @param {FfmpegTool} tool */
function fromEnv(tool) {
  const own = (tool === 'ffmpeg' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH)?.trim();
  if (own) {
    if (isFile(own)) return own;
    throw new Error(
      `${tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'} apunta a «${own}», pero ahí no hay ningún archivo.`,
    );
  }
  // Only FFMPEG_PATH set: ffprobe is normally in the same folder.
  const sibling = tool === 'ffprobe' ? process.env.FFMPEG_PATH?.trim() : '';
  if (sibling) {
    const dir = path.dirname(sibling);
    for (const name of fileNames(tool)) {
      const candidate = join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** @param {FfmpegTool} tool */
function fromPath(tool) {
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of fileNames(tool)) {
      const candidate = join(dir.replace(/^"|"$/g, ''), name);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** @param {FfmpegTool} tool */
function fromWinget(tool) {
  const localAppData = process.env.LOCALAPPDATA;
  if (process.platform !== 'win32' || !localAppData) return null;
  const packages = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  /** @param {string} dir @param {RegExp} pattern */
  const subdirs = (dir, pattern) => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && pattern.test(d.name))
        .map((d) => d.name)
        // Newest version first (ffmpeg-9.0.1-full_build before ffmpeg-8.1-…).
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {
      return [];
    }
  };
  for (const pkg of subdirs(packages, /^Gyan\.FFmpeg/i)) {
    for (const build of subdirs(join(packages, pkg), /^ffmpeg-/i)) {
      const candidate = join(packages, pkg, build, 'bin', `${tool}.exe`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Full path of ffmpeg or ffprobe. Throws a Spanish error saying what to do when it is nowhere.
 * @param {FfmpegTool} tool
 * @returns {string}
 */
export function resolveFfmpegBin(tool) {
  const known = found.get(tool);
  if (known) return known;
  const resolved = fromEnv(tool) ?? fromPath(tool) ?? fromWinget(tool);
  if (!resolved) {
    throw new Error(
      `No encuentro ${tool}. Instálalo (en Windows: «winget install Gyan.FFmpeg») o pon su ruta completa en ${tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'} dentro de .env.local.`,
    );
  }
  found.set(tool, resolved);
  return resolved;
}

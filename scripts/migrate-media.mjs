#!/usr/bin/env node
/*
 * One-off move of the existing exercise videos from the Supabase backup to Bunny, building the
 * first catalog (catalog/catalog.json). Plain Node (>= 20), no new dependencies; needs ffmpeg and
 * ffprobe on the PATH. How-to in Spanish: docs/MUDANZA-BUNNY.md.
 *
 *   node scripts/migrate-media.mjs --backup <folder> [--dump <file>] [--dry-run]
 *        [--to-local] [--overwrite-catalog] [--out <folder>]
 *
 * Inputs (what is assumed, checked by --dry-run):
 *  - <backup>/workout-videos/videos/*.mp4  the bucket objects (any depth works: every .mp4 under
 *    <backup> is indexed by name). Rows point to them through video_url
 *    ".../storage/v1/object/public/workout-videos/<path>".
 *  - <backup>/workout-videos/thumbs/<exercise id>.webp  old thumbnails: only reported. New posters
 *    are always made from the middle of the clip, like the Studio does, so all look alike.
 *  - The database dump: --dump <file>, or the first *.backup / *.sql (optionally .gz) in <backup>.
 *    Plain-text SQL (pg_dump / pg_dumpall), gzip detected by its magic bytes. Rows come from the
 *    block "COPY public.exercises (<columns>) FROM stdin;" … "\." with COPY text escaping;
 *    column names are read from that line; "muscles" is jsonb text.
 *
 * Per row with a local video: original (uploaded as is, same path as in Supabase), lite copy
 * (720 px, H.264, +faststart) and poster (WebP 480 px, middle frame). Videos without a row
 * (orphans) are not uploaded; rows without a video are left out. Resumable: generated files are
 * kept in --out (default scripts/migrate-media.out/) and objects already in the store with the
 * expected size are skipped. The catalog is written at the end only when every row succeeded.
 *
 * Credentials come only from the environment (BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST,
 * BUNNY_STORAGE_KEY, NEXT_PUBLIC_MEDIA_BASE_URL) and are never printed. --to-local writes to
 * .media/ instead (the Studio's development store, served at /dev-media) to try it all safely.
 */

import { createReadStream, openAsBlob } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SUPABASE_MARKER = '/storage/v1/object/public/workout-videos/';
const POSTER_MAX_BYTES = 40 * 1024;
const POSTER_QUALITIES = [72, 60, 50];
const BACKUPS_TO_KEEP = 20;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const args = { dryRun: false, toLocal: false, overwriteCatalog: false, backup: null, dump: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--to-local') args.toLocal = true;
    else if (a === '--overwrite-catalog') args.overwriteCatalog = true;
    else if (a === '--backup') args.backup = argv[++i];
    else if (a === '--dump') args.dump = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return args;
}

const HELP = `Uso: node scripts/migrate-media.mjs --backup <carpeta> [--dump <archivo>] [--dry-run]
       [--to-local] [--overwrite-catalog] [--out <carpeta>]
Lee docs/MUDANZA-BUNNY.md.`;

// ---------------------------------------------------------------- files

async function walk(dir, found = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, found);
    else found.push(full);
  }
  return found;
}

/** name -> [full paths] (several when the same name appears twice). */
function indexByName(files) {
  const index = new Map();
  for (const file of files) {
    const name = path.basename(file);
    index.set(name, [...(index.get(name) ?? []), file]);
  }
  return index;
}

async function findDump(backupDir, files) {
  const candidates = files
    .filter((f) => /\.(backup|sql)(\.gz)?$/i.test(f))
    .sort((a, b) => a.length - b.length);
  return candidates[0] ?? null;
}

async function exists(file) {
  return fs.stat(file).then((s) => s.isFile() && s.size > 0, () => false);
}

// ---------------------------------------------------------------- dump parsing

/** Undo COPY text escaping: \N is null; \b \f \n \r \t \v \\, octal \ooo and hex \xHH. */
export function unescapeCopyField(raw) {
  if (raw === '\\N') return null;
  if (!raw.includes('\\')) return raw;
  const bytes = [];
  const pushText = (text) => bytes.push(...Buffer.from(text, 'utf8'));
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== '\\' || i === raw.length - 1) {
      pushText(ch);
      continue;
    }
    const next = raw[i + 1];
    const simple = { b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };
    if (next in simple) {
      bytes.push(simple[next]);
      i += 1;
    } else if (/[0-7]/.test(next)) {
      const oct = /^[0-7]{1,3}/.exec(raw.slice(i + 1))[0];
      bytes.push(parseInt(oct, 8) & 0xff);
      i += oct.length;
    } else if (next === 'x' && /[0-9a-fA-F]/.test(raw[i + 2] ?? '')) {
      const hex = /^[0-9a-fA-F]{1,2}/.exec(raw.slice(i + 2))[0];
      bytes.push(parseInt(hex, 16));
      i += 1 + hex.length;
    } else {
      pushText(next); // \\ and any other escaped character stand for themselves
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const COPY_LINE = /^COPY\s+(?:"?public"?\.)?"?exercises"?\s*\(([^)]*)\)\s+FROM\s+stdin;\s*$/i;

async function readDumpExercises(dumpPath) {
  const handle = await fs.open(dumpPath, 'r');
  const head = Buffer.alloc(5);
  await handle.read(head, 0, 5, 0);
  await handle.close();

  if (head.subarray(0, 5).toString('latin1') === 'PGDMP') {
    throw new Error(
      'El volcado está en formato personalizado de pg_dump (empieza por PGDMP). Conviértelo a SQL con «pg_restore -f volcado.sql <archivo>» y pásalo con --dump.',
    );
  }
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;
  let stream = createReadStream(dumpPath);
  if (gzipped) stream = stream.pipe(createGunzip());

  const blocks = [];
  let current = null;
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (current) {
      if (line === '\\.') {
        blocks.push(current);
        current = null;
      } else {
        current.rows.push(line);
      }
      continue;
    }
    const match = COPY_LINE.exec(line);
    if (match) {
      const columns = match[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      current = { columns, rows: [] };
    }
  }
  if (current) throw new Error('El bloque COPY de public.exercises no termina con «\\.»: ¿volcado cortado?');
  if (blocks.length === 0) {
    throw new Error('No encuentro «COPY public.exercises (…) FROM stdin;» en el volcado.');
  }

  // A cluster dump may hold several databases: use the block with rows (the last if several).
  const withRows = blocks.filter((b) => b.rows.length > 0);
  const block = withRows[withRows.length - 1] ?? blocks[blocks.length - 1];
  const warnings = blocks.length > 1 ? [`Hay ${blocks.length} bloques COPY de exercises; uso el último con filas.`] : [];

  const records = [];
  block.rows.forEach((line, n) => {
    const fields = line.split('\t');
    if (fields.length !== block.columns.length) {
      warnings.push(`Fila ${n + 1}: ${fields.length} campos para ${block.columns.length} columnas; se ignora.`);
      return;
    }
    const record = {};
    block.columns.forEach((col, i) => {
      record[col] = unescapeCopyField(fields[i]);
    });
    records.push(record);
  });

  return { columns: block.columns, records, gzipped, warnings };
}

// ---------------------------------------------------------------- rows -> exercises

function toNumber(value, fallback) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) ? n : fallback;
}

function parseMuscles(raw, rowId, warnings) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.id === 'string' && (m.role === 'primary' || m.role === 'secondary')) : null;
  } catch {
    warnings.push(`Fila ${rowId}: «muscles» no es JSON válido; se deja vacío.`);
    return null;
  }
}

export function objectPathFromVideoUrl(url) {
  if (!url) return null;
  const clean = url.split(/[?#]/)[0];
  const idx = clean.indexOf(SUPABASE_MARKER);
  if (idx !== -1) return decodeURIComponent(clean.slice(idx + SUPABASE_MARKER.length));
  // Unknown host: fall back to "videos/<file name>" so the file can still be matched by name.
  const name = decodeURIComponent(clean.split('/').pop() ?? '');
  return name ? `videos/${name}` : null;
}

function rowToExercise(record, warnings) {
  const id = String(record.id ?? '').trim();
  const difficulty = toNumber(record.difficulty, null);
  return {
    id,
    title: record.title ?? 'Sin nombre',
    type: record.type || 'workout',
    video_url: record.video_url ?? '',
    video_lite_url: null,
    poster_url: null,
    muscle: record.muscle || 'cuerpo_completo',
    muscles: parseMuscles(record.muscles, id, warnings),
    difficulty: difficulty ?? (record.difficulty || 5),
    duration_seconds: Math.round(toNumber(record.duration_seconds, 60)),
    equipment: record.equipment || 'ninguno',
    talks: [],
    _createdAt: record.created_at ?? null,
  };
}

// ---------------------------------------------------------------- media store

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function makeStore(toLocal) {
  const zone = process.env.BUNNY_STORAGE_ZONE?.trim() ?? '';
  const host = (process.env.BUNNY_STORAGE_HOST?.trim() ?? '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const key = process.env.BUNNY_STORAGE_KEY?.trim() ?? '';
  const envBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim() ?? '').replace(/\/+$/, '');

  if (toLocal) {
    const root = path.join(process.cwd(), '.media');
    const baseUrl = envBase && !/^https?:\/\//i.test(envBase) ? envBase : '/dev-media';
    const file = (p) => path.join(root, ...p.split('/'));
    return {
      label: `disco local (${root}), URLs ${baseUrl}/…`,
      publicUrl: (p) => `${baseUrl}/${encodePath(p)}`,
      async list(dir) {
        const entries = await fs.readdir(file(dir), { withFileTypes: true }).catch(() => []);
        const out = new Map();
        for (const e of entries) if (e.isFile()) out.set(e.name, (await fs.stat(path.join(file(dir), e.name))).size);
        return out;
      },
      async put(p, source) {
        await fs.mkdir(path.dirname(file(p)), { recursive: true });
        if (Buffer.isBuffer(source)) await fs.writeFile(file(p), source);
        else await fs.copyFile(source, file(p));
      },
      async getText(p) {
        return fs.readFile(file(p), 'utf8').catch(() => null);
      },
      async remove(p) {
        await fs.rm(file(p), { force: true });
      },
    };
  }

  const missing = [
    ['BUNNY_STORAGE_ZONE', zone],
    ['BUNNY_STORAGE_HOST', host],
    ['BUNNY_STORAGE_KEY', key],
    ['NEXT_PUBLIC_MEDIA_BASE_URL', envBase],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')} (o usa --to-local para probar en disco).`);
  }

  const url = (p, dir = false) => `https://${host}/${encodeURIComponent(zone)}/${encodePath(p)}${dir ? '/' : ''}`;
  const fail = async (what, res) => {
    const hint = res.status === 401
      ? ' Revisa BUNNY_STORAGE_KEY (la «Password» de la storage zone) y BUNNY_STORAGE_HOST (el «API Endpoint» de su región; si no coincide, Bunny responde 401).'
      : '';
    const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    return new Error(`${what}: HTTP ${res.status}${text ? ` · ${text}` : ''}.${hint}`);
  };

  return {
    label: `Bunny (${host}), URLs ${envBase}/…`,
    publicUrl: (p) => `${envBase}/${encodePath(p)}`,
    async list(dir) {
      const res = await fetch(url(dir, true), { headers: { AccessKey: key, Accept: 'application/json' } });
      if (res.status === 404) return new Map();
      if (!res.ok) throw await fail(`No se pudo listar ${dir}/`, res);
      const items = await res.json();
      return new Map(items.filter((i) => !i.IsDirectory).map((i) => [i.ObjectName, Number(i.Length ?? 0)]));
    },
    async put(p, source) {
      const isBuffer = Buffer.isBuffer(source);
      const hash = createHash('sha256');
      if (isBuffer) hash.update(source);
      else for await (const chunk of createReadStream(source)) hash.update(chunk);
      const body = isBuffer ? new Uint8Array(source) : await openAsBlob(source);
      const res = await fetch(url(p), {
        method: 'PUT',
        headers: { AccessKey: key, Checksum: hash.digest('hex').toUpperCase(), 'Content-Type': 'application/octet-stream' },
        body,
      });
      if (res.status !== 201) throw await fail(`Bunny no aceptó ${p}`, res);
    },
    async getText(p) {
      const res = await fetch(url(p), { headers: { AccessKey: key } });
      if (res.status === 404) return null;
      if (!res.ok) throw await fail(`No se pudo leer ${p}`, res);
      return res.text();
    },
    async remove(p) {
      const res = await fetch(url(p), { method: 'DELETE', headers: { AccessKey: key } });
      if (!res.ok && res.status !== 404) throw await fail(`No se pudo borrar ${p}`, res);
    },
  };
}

// ---------------------------------------------------------------- ffmpeg

async function hasTool(name) {
  return execFileAsync(name, ['-version'], { windowsHide: true }).then(() => true, () => false);
}

async function ffmpeg(args) {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
}

async function probe(file) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
  );
  const parsed = JSON.parse(stdout);
  const streams = parsed.streams ?? [];
  const duration = Number.parseFloat(parsed.format?.duration ?? '');
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** Same settings as lib/server/ffmpeg.ts createLiteVideo(). */
async function makeLite(source, target, keepAudio) {
  const args = ['-y', '-i', source, '-map', '0:v:0'];
  if (keepAudio) args.push('-map', '0:a:0?');
  args.push(
    '-vf', 'scale=720:-2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high',
    '-crf', '26', '-maxrate', '1600k', '-bufsize', '3200k',
    ...(keepAudio ? ['-c:a', 'copy'] : ['-an']),
    '-movflags', '+faststart',
    `${target}.part.mp4`,
  );
  await ffmpeg(args);
  await fs.rename(`${target}.part.mp4`, target);
}

let sharpModule;
async function loadSharp() {
  if (sharpModule === undefined) {
    sharpModule = await import('sharp').then((m) => m.default, () => null);
  }
  return sharpModule;
}

/** Same criterion as lib/server/ffmpeg.ts createPosterImage(): middle frame, WebP 480 px, ~30 KB. */
async function makePoster(source, durationSeconds, target) {
  const frame = `${target}.frame.png`;
  const grab = (at) => ffmpeg(['-y', '-ss', at.toFixed(2), '-i', source, '-frames:v', '1', '-vf', 'scale=480:-2', frame]);
  await grab(Math.max(0, durationSeconds / 2));
  if (!(await exists(frame))) await grab(0);

  const sharp = await loadSharp();
  if (sharp) {
    let webp = null;
    for (const quality of POSTER_QUALITIES) {
      webp = await sharp(frame).resize({ width: 480, withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer();
      if (webp.length <= POSTER_MAX_BYTES) break;
    }
    await fs.writeFile(target, webp);
  } else {
    await ffmpeg(['-y', '-i', frame, '-c:v', 'libwebp', '-quality', '70', target]);
  }
  await fs.rm(frame, { force: true });
}

// ---------------------------------------------------------------- main

function log(...parts) {
  console.log(...parts);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.backup) {
    log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const backupDir = path.resolve(args.backup);
  const outDir = path.resolve(args.out ?? path.join('scripts', 'migrate-media.out'));
  const files = await walk(backupDir);
  if (files.length === 0) throw new Error(`La carpeta ${backupDir} está vacía o no existe.`);

  const videos = files.filter((f) => /\.mp4$/i.test(f));
  const videoIndex = indexByName(videos);
  const thumbIndex = indexByName(files.filter((f) => /\.webp$/i.test(f)));
  const dumpPath = args.dump ? path.resolve(args.dump) : await findDump(backupDir, files);
  if (!dumpPath) throw new Error('No encuentro el volcado (*.backup o *.sql). Pásalo con --dump <archivo>.');

  const dump = await readDumpExercises(dumpPath);
  const warnings = [...dump.warnings];
  const exercises = dump.records.map((r) => rowToExercise(r, warnings));

  // Match each row to its local video.
  const usedVideos = new Set();
  const plan = exercises.map((ex) => {
    const objectPath = objectPathFromVideoUrl(ex.video_url);
    const name = objectPath ? path.posix.basename(objectPath) : null;
    const direct = objectPath
      ? [path.join(backupDir, 'workout-videos', ...objectPath.split('/')), path.join(backupDir, ...objectPath.split('/'))]
      : [];
    const byName = name ? videoIndex.get(name) ?? [] : [];
    const localFile = direct.find((p) => videos.includes(p)) ?? byName[0] ?? null;
    if (localFile) usedVideos.add(localFile);
    if (byName.length > 1) warnings.push(`«${name}» aparece ${byName.length} veces en la copia; uso ${localFile}.`);
    const base = name ? name.replace(/\.mp4$/i, '') : null;
    return {
      exercise: ex,
      objectPath,
      localFile,
      oldThumb: thumbIndex.get(`${ex.id}.webp`)?.[0] ?? null,
      targets: base
        ? { original: `videos/${name}`, lite: `videos/lite/${name}`, poster: `posters/${base}.webp` }
        : null,
    };
  });
  const missingIds = plan.filter((p) => !p.exercise.id).length;
  if (missingIds) warnings.push(`${missingIds} fila(s) sin id: se ignoran.`);
  const matched = plan.filter((p) => p.localFile && p.targets && p.exercise.id);
  const unmatched = plan.filter((p) => !(p.localFile && p.targets && p.exercise.id));
  const orphans = videos.filter((v) => !usedVideos.has(v));
  const known = new Set(['id', 'title', 'video_url', 'difficulty', 'muscle', 'equipment', 'duration_seconds', 'created_at', 'type', 'muscles', 'video_lite_url', 'poster_url']);
  const ignoredColumns = dump.columns.filter((c) => !known.has(c));

  log(`\nCopia: ${backupDir}`);
  log(`Volcado: ${dumpPath}${dump.gzipped ? ' (gzip)' : ''}`);
  log(`Columnas de public.exercises: ${dump.columns.join(', ')}`);
  if (ignoredColumns.length) log(`  (no pasan al catálogo: ${ignoredColumns.join(', ')})`);
  log(`Filas: ${exercises.length} · vídeos en la copia: ${videos.length} · miniaturas antiguas: ${[...thumbIndex.keys()].length}`);
  log(`\nFilas con vídeo (${matched.length}):`);
  for (const p of matched) {
    log(`  ${p.exercise.id}  ${p.exercise.title}\n      ← ${path.relative(backupDir, p.localFile)}${p.oldThumb ? '  · tiene thumbs/' + path.basename(p.oldThumb) + ' (se genera póster nuevo)' : ''}`);
  }
  if (unmatched.length) {
    log(`\nFilas SIN vídeo en la copia (${unmatched.length}), no entran en el catálogo:`);
    for (const p of unmatched) log(`  ${p.exercise.id || '(sin id)'}  ${p.exercise.title}  · ${p.objectPath ?? p.exercise.video_url ?? 'sin video_url'}`);
  }
  if (orphans.length) {
    log(`\nVídeos huérfanos, sin fila (${orphans.length}), no se suben:`);
    for (const o of orphans) log(`  ${path.relative(backupDir, o)}`);
  }
  if (warnings.length) {
    log('\nAvisos:');
    for (const w of warnings) log(`  - ${w}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    backupDir,
    dumpPath,
    columns: dump.columns,
    rows: exercises.length,
    videosInBackup: videos.length,
    matched: matched.map((p) => ({ id: p.exercise.id, title: p.exercise.title, localFile: p.localFile, oldThumb: p.oldThumb, targets: p.targets })),
    rowsWithoutVideo: unmatched.map((p) => ({ id: p.exercise.id, title: p.exercise.title, videoUrl: p.exercise.video_url })),
    orphanVideos: orphans,
    warnings,
    results: [],
    catalogWritten: false,
  };
  await fs.mkdir(outDir, { recursive: true });

  const ffmpegReady = (await hasTool('ffmpeg')) && (await hasTool('ffprobe'));
  if (args.dryRun) {
    log(`\nffmpeg/ffprobe en el PATH: ${ffmpegReady ? 'sí' : 'NO (hace falta para la ejecución real)'}`);
    let storeLabel;
    try {
      storeLabel = makeStore(args.toLocal).label;
    } catch (err) {
      storeLabel = `sin configurar: ${err.message}`;
    }
    log(`Destino: ${storeLabel}`);
    log(`\nSimulación: no se ha subido nada. Por ejercicio se subirían 3 archivos (original, ligera, póster) y al final catalog/catalog.json con ${matched.length} ejercicios y music: [].`);
    await fs.writeFile(path.join(outDir, 'report-dry-run.json'), JSON.stringify(report, null, 2));
    log(`Informe: ${path.join(outDir, 'report-dry-run.json')}`);
    return;
  }

  if (!ffmpegReady) throw new Error('No encuentro ffmpeg y ffprobe en el PATH.');
  const store = makeStore(args.toLocal);
  log(`\nDestino: ${store.label}`);

  const workDir = path.join(outDir, 'work');
  await fs.mkdir(workDir, { recursive: true });
  const remote = {
    videos: await store.list('videos'),
    lite: await store.list('videos/lite'),
    posters: await store.list('posters'),
  };

  let failed = 0;
  for (const [n, p] of matched.entries()) {
    const ex = p.exercise;
    const tag = `[${n + 1}/${matched.length}] ${ex.title}`;
    const result = { id: ex.id, title: ex.title, uploaded: [], skipped: [], error: null };
    try {
      const info = await probe(p.localFile);
      if (info.durationSeconds > 0) {
        const real = Math.max(1, Math.round(info.durationSeconds));
        if (real !== ex.duration_seconds) result.durationChanged = { from: ex.duration_seconds, to: real };
        ex.duration_seconds = real;
      }
      const keepAudio = ex.type === 'intro' && info.hasAudio;
      const localSize = (await fs.stat(p.localFile)).size;
      const base = path.posix.basename(p.targets.original, '.mp4');
      const liteFile = path.join(workDir, `${base}-lite.mp4`);
      const posterFile = path.join(workDir, `${base}.webp`);

      // Original: as is (it was already compressed to 1080 px by the Studio).
      if (remote.videos.get(path.posix.basename(p.targets.original)) === localSize) result.skipped.push('original');
      else {
        await store.put(p.targets.original, p.localFile);
        result.uploaded.push('original');
      }

      if (!remote.lite.get(path.posix.basename(p.targets.lite))) {
        if (!(await exists(liteFile))) await makeLite(p.localFile, liteFile, keepAudio);
        await store.put(p.targets.lite, liteFile);
        result.uploaded.push('lite');
      } else result.skipped.push('lite');

      if (!remote.posters.get(path.posix.basename(p.targets.poster))) {
        if (!(await exists(posterFile))) {
          const source = (await exists(liteFile)) ? liteFile : p.localFile;
          await makePoster(source, info.durationSeconds || ex.duration_seconds, posterFile);
        }
        await store.put(p.targets.poster, posterFile);
        result.uploaded.push('poster');
      } else result.skipped.push('poster');

      ex.video_url = store.publicUrl(p.targets.original);
      ex.video_lite_url = store.publicUrl(p.targets.lite);
      ex.poster_url = store.publicUrl(p.targets.poster);
      log(`${tag}: subidos ${result.uploaded.join(', ') || 'ninguno'}${result.skipped.length ? ` · ya estaban ${result.skipped.join(', ')}` : ''}`);
    } catch (err) {
      failed += 1;
      result.error = err instanceof Error ? err.message : String(err);
      log(`${tag}: ERROR ${result.error}`);
    }
    report.results.push(result);
  }

  if (failed > 0) {
    log(`\n${failed} ejercicio(s) con error: no escribo el catálogo. Vuelve a lanzar el mismo comando; lo ya subido se salta.`);
  } else {
    const existing = await store.getText('catalog/catalog.json');
    let existingCount = 0;
    if (existing !== null) {
      try {
        existingCount = (JSON.parse(existing).exercises ?? []).length;
      } catch {
        existingCount = -1;
      }
    }
    if (existing !== null && existingCount !== 0 && !args.overwriteCatalog) {
      log('\nYa existe catalog/catalog.json con contenido: no lo sobrescribo. Si de verdad quieres reemplazarlo (se guarda copia), añade --overwrite-catalog.');
    } else {
      if (existing !== null) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await store.put(`catalog/backups/catalog-${stamp}.json`, Buffer.from(existing, 'utf8'));
        const backups = [...(await store.list('catalog/backups')).keys()].filter((k) => /^catalog-.*\.json$/.test(k)).sort();
        for (const old of backups.slice(0, Math.max(0, backups.length - BACKUPS_TO_KEEP))) await store.remove(`catalog/backups/${old}`);
      }
      // Newest first, like the Studio lists them; created_at only orders, it is not kept.
      const ordered = matched
        .map((p) => p.exercise)
        .sort((a, b) => String(b._createdAt ?? '').localeCompare(String(a._createdAt ?? '')));
      for (const exercise of ordered) delete exercise._createdAt;
      const catalog = { version: 1, updatedAt: new Date().toISOString(), exercises: ordered, music: [] };
      await store.put('catalog/catalog.json', Buffer.from(JSON.stringify(catalog), 'utf8'));
      report.catalogWritten = true;
      log(`\nCatálogo escrito: catalog/catalog.json con ${ordered.length} ejercicios.`);
    }
  }

  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  log(`Informe: ${path.join(outDir, 'report.json')}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

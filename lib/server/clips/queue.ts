import 'server-only';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { clipTypeInComment, matchExerciseTitle, musclesIn } from '@/lib/clips/intent';
import { MAX_COMMENT_LENGTH, type ClipOrigin, type ClipQueueItem, type ClipStatus } from '@/lib/clips/queue';
import { clipNeedsRoutine, type ClipType } from '@/lib/clips/types';
import { probeVideo } from '@/lib/server/ffmpeg';
import { CLIPS_ROOT, FILES_DIR, MANIFEST_PATH, SPECS_DIR, clipsPath, relativeToClips } from '@/lib/server/clips/paths';
import type { ClipSpec } from '@/lib/server/clips/recipes';
import { renderClip } from '@/lib/server/clips/render';
import { ff, join } from '@/lib/server/clips/run';
import { catalogTitles, fromChoice, fromRoutine, type Choice, type ResolvedClip } from '@/lib/server/clips/select';
import type { MuscleId } from '@/types/workout';

/*
 * The clip queue on the Studio computer: a JSON manifest in .clips/ plus the rendered files.
 *  - Creating a clip only resolves it (fast) and queues it; renders run in the background,
 *    one at a time, in the order they were asked for.
 *  - Progress lives in memory while a render runs; the manifest records start and end.
 *  - State and the manifest lock live on globalThis: Next dev compiles each route on its own,
 *    and they must share one queue.
 *  - After a restart, a clip that was rendering cannot finish: it is marked as failed.
 */

export class ClipQueueError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface Manifest {
  version: 1;
  items: ClipQueueItem[]; // newest first
}

/** How a clip was asked for, kept next to its spec so it can be asked for again. */
type StoredRequest =
  | { origin: 'player'; type: ClipType }
  | { origin: 'sentence' | 'manual'; choice: Omit<Choice, 'variant' | 'avoid'> };

interface StoredSpec {
  spec: ClipSpec;
  request: StoredRequest;
}

interface QueueState {
  pending: string[];
  running: string | null;
  live: Map<string, { progress: number; step: string }>;
  lock: Promise<unknown>;
  recovered: boolean;
}

const STATE_KEY = Symbol.for('everydaym.clips.queue');
type GlobalWithQueue = typeof globalThis & { [STATE_KEY]?: QueueState };

function state(): QueueState {
  const holder = globalThis as GlobalWithQueue;
  holder[STATE_KEY] ??= { pending: [], running: null, live: new Map(), lock: Promise.resolve(), recovered: false };
  return holder[STATE_KEY];
}

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const s = state();
  const run = s.lock.then(task, task);
  s.lock = run.catch(() => undefined);
  return run;
}

async function readManifest(): Promise<Manifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Partial<Manifest>;
    return { version: 1, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, items: [] };
    throw new Error('La cola de clips (.clips/manifest.json) está dañada.');
  }
}

/** Write then rename, so a reader never sees half a file (retries: Windows may hold the old one). */
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(CLIPS_ROOT, { recursive: true });
  const temp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 1));
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temp, file);
      return;
    } catch (err) {
      if (attempt >= 5) {
        await fs.rm(temp, { force: true }).catch(() => {});
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

function updateManifest<T>(mutate: (manifest: Manifest) => T): Promise<T> {
  return withLock(async () => {
    const manifest = await readManifest();
    const result = mutate(manifest);
    await writeJson(MANIFEST_PATH, manifest);
    return result;
  });
}

function patchItem(id: string, patch: Partial<ClipQueueItem>): Promise<ClipQueueItem | null> {
  return updateManifest((m) => {
    const item = m.items.find((i) => i.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    return { ...item };
  });
}

/** Once per server process: clips left "rendering" by a previous run will never finish. */
async function recover(): Promise<void> {
  const s = state();
  if (s.recovered) return;
  s.recovered = true;
  await updateManifest((m) => {
    for (const item of m.items) {
      if (item.status === 'rendering' && item.id !== s.running && !s.pending.includes(item.id)) {
        item.status = 'failed';
        item.error = 'Se cortó al cerrarse el Estudio. Pulsa «Otra versión» para hacerlo de nuevo.';
        item.step = '';
        item.updatedAt = new Date().toISOString();
      }
    }
  }).catch(() => {});
}

function withLive(item: ClipQueueItem): ClipQueueItem {
  const s = state();
  const live = s.live.get(item.id);
  if (item.status !== 'rendering') return item;
  if (live) return { ...item, progress: live.progress, step: live.step };
  const ahead = s.pending.indexOf(item.id);
  return ahead >= 0 ? { ...item, step: ahead === 0 && !s.running ? 'Empezando' : `En cola · ${ahead + (s.running ? 1 : 0)} delante` } : item;
}

export async function listClips(): Promise<ClipQueueItem[]> {
  await recover();
  return (await readManifest()).items.map(withLive);
}

export async function getClip(id: string): Promise<ClipQueueItem | null> {
  await recover();
  const item = (await readManifest()).items.find((i) => i.id === id);
  return item ? withLive(item) : null;
}

async function requireClip(id: string): Promise<ClipQueueItem> {
  const item = await getClip(id);
  if (!item) throw new ClipQueueError('Ese clip ya no existe.', 404);
  return item;
}

/* ── files ────────────────────────────────────────────────────────────────── */

const targetFor = (id: string) => ({
  video: join(FILES_DIR, `${id}.mp4`),
  slidesDir: join(FILES_DIR, id),
  zip: join(FILES_DIR, `${id}.zip`),
  poster: join(FILES_DIR, `${id}.jpg`),
});

export function clipFilePath(item: ClipQueueItem): string | null {
  return item.file ? clipsPath(item.file) : null;
}

export function clipPosterPath(item: ClipQueueItem): string {
  return targetFor(item.id).poster;
}

export function clipSlidePath(item: ClipQueueItem, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= item.slides) return null;
  return join(targetFor(item.id).slidesDir, `everydaym-${String(index + 1).padStart(2, '0')}.jpg`);
}

async function removeFiles(id: string): Promise<void> {
  const t = targetFor(id);
  await Promise.all(
    [t.video, t.zip, t.poster, join(SPECS_DIR, `${id}.json`)].map((f) => fs.rm(f, { force: true }).catch(() => {})),
  );
  await fs.rm(t.slidesDir, { recursive: true, force: true }).catch(() => {});
}

/** The last lines FFmpeg wrote, rather than the whole command line. */
function errorText(err: unknown): string {
  const stderr = (err as { stderr?: unknown }).stderr;
  if (typeof stderr === 'string' && stderr.trim()) {
    return `FFmpeg: ${stderr.trim().split('\n').slice(-3).join(' · ')}`.slice(0, 400);
  }
  return err instanceof Error ? err.message.slice(0, 400) : 'Error al montar el clip.';
}

/* ── rendering, one at a time ─────────────────────────────────────────────── */

async function renderOne(id: string): Promise<void> {
  const s = state();
  const t = targetFor(id);
  try {
    const stored = JSON.parse(await fs.readFile(join(SPECS_DIR, `${id}.json`), 'utf8')) as StoredSpec;
    if (!(await patchItem(id, { step: 'Empezando', progress: 0 }))) return; // deleted meanwhile
    await fs.mkdir(FILES_DIR, { recursive: true });
    const result = await renderClip(stored.spec, t, (progress, step) => s.live.set(id, { progress, step }));

    s.live.set(id, { progress: 0.98, step: 'Preparando la miniatura' });
    if (result.kind === 'photos') {
      await sharp(result.slides[0]).resize({ width: 360 }).jpeg({ quality: 72 }).toFile(t.poster);
    } else {
      await ff(['-ss', '1.2', '-i', result.file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', t.poster]).catch(() =>
        ff(['-i', result.file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', t.poster]),
      );
    }
    const stat = await fs.stat(result.file);
    const seconds = result.kind === 'video' ? (await probeVideo(result.file)).durationSeconds : null;
    await patchItem(id, {
      status: 'ready',
      file: relativeToClips(result.file),
      durationSeconds: seconds === null ? null : Math.round(seconds * 10) / 10,
      sizeBytes: stat.size,
      slides: result.slides.length,
      notes: result.notes,
      progress: 1,
      step: 'Listo',
      error: null,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    await patchItem(id, { status: 'failed', error: errorText(err), step: '', finishedAt: new Date().toISOString() }).catch(() => {});
  } finally {
    s.live.delete(id);
  }
}

function kick(): void {
  const s = state();
  if (s.running) return;
  const next = s.pending.shift();
  if (!next) return;
  s.running = next;
  void renderOne(next).finally(() => {
    s.running = null;
    kick();
  });
}

/* ── creating ─────────────────────────────────────────────────────────────── */

async function enqueue(
  resolved: ResolvedClip,
  o: { origin: ClipOrigin; instruction: string; request: StoredRequest; regeneratedFrom: string | null },
): Promise<ClipQueueItem> {
  await recover();
  const id = randomUUID();
  const now = new Date().toISOString();
  await fs.mkdir(SPECS_DIR, { recursive: true });
  await writeJson(join(SPECS_DIR, `${id}.json`), { spec: resolved.spec, request: o.request } satisfies StoredSpec);
  const item: ClipQueueItem = {
    id,
    type: resolved.spec.type,
    origin: o.origin,
    instruction: o.instruction.slice(0, 300),
    exercises: resolved.exercises,
    talkIds: resolved.talkIds,
    status: 'rendering',
    comment: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    file: null,
    durationSeconds: null,
    sizeBytes: null,
    slides: 0,
    progress: 0,
    step: 'En cola',
    error: null,
    notes: [],
    caption: resolved.caption,
    regeneratedFrom: o.regeneratedFrom,
    variant: resolved.spec.variant,
  };
  await updateManifest((m) => {
    m.items.unshift(item);
  });
  state().pending.push(id);
  kick();
  return withLive(item);
}

export async function enqueueFromRoutine(o: {
  type: ClipType;
  routine: { queue: unknown; meta: unknown; prompt?: unknown };
  handle: string;
}): Promise<ClipQueueItem> {
  const resolved = fromRoutine({ ...o, variant: 0, avoid: { exerciseIds: [], talkIds: [] } });
  return enqueue(resolved, {
    origin: 'player',
    instruction: `Desde el reproductor · «${resolved.spec.prompt}»`,
    request: { origin: 'player', type: o.type },
    regeneratedFrom: null,
  });
}

export async function enqueueFromChoice(
  choice: Omit<Choice, 'variant' | 'avoid'>,
  o: { origin: 'sentence' | 'manual'; instruction: string },
): Promise<ClipQueueItem> {
  const resolved = await fromChoice({ ...choice, variant: 0, avoid: { exerciseIds: [], talkIds: [] } });
  return enqueue(resolved, { origin: o.origin, instruction: o.instruction, request: { origin: o.origin, choice }, regeneratedFrom: null });
}

/* ── reviewing ────────────────────────────────────────────────────────────── */

function cleanComment(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT_LENGTH);
  return text || null;
}

export async function reviewClip(id: string, status: Extract<ClipStatus, 'approved' | 'rejected'>, comment?: unknown): Promise<ClipQueueItem> {
  const item = await requireClip(id);
  if (item.status === 'rendering' || item.status === 'failed') {
    throw new ClipQueueError('Solo se puede revisar un clip ya montado.', 409);
  }
  const text = cleanComment(comment);
  const updated = await patchItem(id, { status, comment: text ?? (status === 'approved' ? item.comment : null) });
  if (!updated) throw new ClipQueueError('Ese clip ya no existe.', 404);
  return withLive(updated);
}

/**
 * A new render of the same request, as a new item (the old one stays as history). It avoids
 * the exercises and talks the old one used when there are others, uses other words, and reads
 * the comment: a muscle, a clip type or an exercise named there replaces the old one.
 */
export async function regenerateClip(id: string, rawComment?: unknown): Promise<ClipQueueItem> {
  const old = await requireClip(id);
  if (old.status === 'rendering') throw new ClipQueueError('Espera a que termine de montarse.', 409);
  const comment = cleanComment(rawComment) ?? old.comment;
  if (comment !== old.comment) await patchItem(id, { comment });

  let stored: StoredSpec;
  try {
    stored = JSON.parse(await fs.readFile(join(SPECS_DIR, `${id}.json`), 'utf8')) as StoredSpec;
  } catch {
    throw new ClipQueueError('No se guardó cómo se hizo este clip; pídelo de nuevo.', 410);
  }
  const avoid = { exerciseIds: old.exercises.map((e) => e.id), talkIds: old.talkIds };
  const variant = (old.variant ?? 0) + 1;
  const asked = comment ? clipTypeInComment(comment) : null;
  const instruction = comment ? `${old.instruction} · «${comment}»` : old.instruction;

  if (stored.request.origin === 'player') {
    const type = asked && clipNeedsRoutine(asked) ? asked : stored.request.type;
    const resolved = fromRoutine({
      type,
      routine: { queue: stored.spec.queue, meta: stored.spec.meta, prompt: stored.spec.prompt },
      handle: stored.spec.handle,
      variant,
      avoid,
    });
    return enqueue(resolved, { origin: 'player', instruction, request: { origin: 'player', type }, regeneratedFrom: id });
  }

  const choice = { ...stored.request.choice };
  if (comment) {
    const muscles: MuscleId[] = musclesIn(comment);
    if (muscles.length) {
      choice.muscles = muscles;
      choice.exerciseId = null;
      choice.exerciseTitle = null;
    }
    if (asked) choice.type = asked;
    const named = matchExerciseTitle(comment, await catalogTitles());
    if (named) {
      choice.exerciseId = null;
      choice.exerciseTitle = named;
    }
  }
  const resolved = await fromChoice({ ...choice, variant, avoid });
  return enqueue(resolved, { origin: stored.request.origin, instruction, request: { origin: stored.request.origin, choice }, regeneratedFrom: id });
}

export async function deleteClip(id: string): Promise<void> {
  const s = state();
  if (s.running === id) throw new ClipQueueError('Se está montando ahora: espera a que termine para borrarlo.', 409);
  s.pending = s.pending.filter((p) => p !== id);
  const removed = await updateManifest((m) => {
    const before = m.items.length;
    m.items = m.items.filter((i) => i.id !== id);
    return m.items.length < before;
  });
  if (!removed) throw new ClipQueueError('Ese clip ya no existe.', 404);
  await removeFiles(id);
}

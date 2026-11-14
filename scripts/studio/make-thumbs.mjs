// Cut-out thumbnails (person only, transparent background) for every exercise, stored next to
// the videos in Supabase: workout-videos/thumbs/<exercise id>.webp. The app shows them in the plan
// and in "what's next". macOS only (Apple Vision does the cut-out).
//
//   node --env-file=.env.local scripts/studio/make-thumbs.mjs          only the missing ones
//   node --env-file=.env.local scripts/studio/make-thumbs.mjs --force  redo all
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).');
if (process.platform !== 'darwin') throw new Error('El recorte usa Apple Vision: ejecútalo en un Mac.');
const force = process.argv.includes('--force');
const auth = { apikey: key, Authorization: `Bearer ${key}` };

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'everydaym-thumbs-'));
const cutter = path.join(dir, 'cutout');
await run('swiftc', ['-O', path.join(import.meta.dirname, 'cutout.swift'), '-o', cutter]);

const res = await fetch(`${base}/rest/v1/exercises?select=id,title,video_url,duration_seconds,type`, { headers: auth });
if (!res.ok) throw new Error(`No se pudo leer la tabla de ejercicios (${res.status}).`);
const exercises = (await res.json()).filter((e) => e.type === 'workout' || e.type === 'warmup');

let made = 0;
for (const ex of exercises) {
  const target = `${base}/storage/v1/object/public/workout-videos/thumbs/${ex.id}.webp`;
  if (!force && (await fetch(target, { method: 'HEAD' })).ok) continue;
  const frame = path.join(dir, `${ex.id}.png`);
  const cut = path.join(dir, `${ex.id}-cut.png`);
  try {
    // a frame a third of the way in: past the start pose, mid-movement
    const at = Math.max(1, (Number(ex.duration_seconds) || 30) * 0.33);
    await run('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(1), '-i', ex.video_url, '-frames:v', '1', '-vf', 'scale=-2:900', frame]);
    await run(cutter, [frame, cut]);
    const webp = await sharp(cut).trim().resize({ height: 360, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
    const up = await fetch(`${base}/storage/v1/object/workout-videos/thumbs/${ex.id}.webp`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
      body: webp,
    });
    if (!up.ok) throw new Error(`subida ${up.status}`);
    made += 1;
    console.log('✓', ex.title);
  } catch (error) {
    console.log('✗', ex.title, '·', error.message?.split('\n')[0]);
  }
}
await fs.rm(dir, { recursive: true, force: true });
console.log(`${made} miniaturas nuevas de ${exercises.length} ejercicios.`);

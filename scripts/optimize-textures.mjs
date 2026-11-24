// Shrinks the cloud photos used by the rest transition (components/workout/CloudTransition.tsx).
//
//   node scripts/optimize-textures.mjs
//
// Each cloud is resized to 900 px wide, gets its soft oval edge baked into the alpha channel
// (the player used to do it with a CSS mask on every frame of the animation) and is saved as
// WebP well under 100 KB. Files that are already 900 px wide or less are left alone, so running
// it twice changes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.join(process.cwd(), 'public', 'textures');
const FILES = ['nube-1.webp', 'nube-2.webp', 'nube-3.webp', 'nube-4.webp'];
const WIDTH = 900;

/** Opaque up to 58 % of the radius, transparent at the edge: the old CSS mask, as pixels. */
function ovalMask(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="58%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="80%" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#g)"/>
</svg>`;
  return Buffer.from(svg);
}

for (const name of FILES) {
  const file = path.join(DIR, name);
  const input = await readFile(file);
  const meta = await sharp(input).metadata();
  if (!meta.width || meta.width <= WIDTH) {
    console.log(`${name}: ya optimizada (${meta.width} px, ${(input.length / 1024).toFixed(0)} KB)`);
    continue;
  }

  const resized = await sharp(input).resize({ width: WIDTH }).ensureAlpha().png().toBuffer();
  const { height = WIDTH } = await sharp(resized).metadata();
  const output = await sharp(resized)
    .composite([{ input: ovalMask(WIDTH, height), blend: 'dest-in' }])
    .webp({ quality: 76, alphaQuality: 75, effort: 6, smartSubsample: true })
    .toBuffer();

  await writeFile(file, output);
  console.log(
    `${name}: ${meta.width}×${meta.height} ${(input.length / 1024).toFixed(0)} KB → ${WIDTH}×${height} ${(output.length / 1024).toFixed(0)} KB`,
  );
}

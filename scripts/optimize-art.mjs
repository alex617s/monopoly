// Shrinks the pictures in public/art so the game loads fast on an iPad.
// Safe to run again: pictures that are already small are left alone.
// Sprites are trimmed to their visible edges; textures stay square.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/art');
const SPRITE_MAX = 384;
const TEXTURE_MAX = 512;

let before = 0;
let after = 0;
for (const name of (await readdir(DIR)).filter((f) => f.endsWith('.png')).sort()) {
  const file = path.join(DIR, name);
  const input = await readFile(file);
  before += input.length;
  const texture = name.startsWith('tex-');
  const cover = name === 'home.png';
  const max = cover ? 1400 : texture ? TEXTURE_MAX : name.startsWith('shopkeeper-') ? 512 : SPRITE_MAX;
  const meta = await sharp(input).metadata();
  if (meta.width <= max && meta.height <= max && input.length < (cover ? 900_000 : 200_000)) {
    after += input.length;
    continue;
  }
  let img = sharp(input);
  if (!texture && !cover && meta.hasAlpha) img = sharp(await img.trim({ threshold: 10 }).toBuffer());
  const out = await img
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
  await writeFile(file, out);
  after += out.length;
  console.log(`${name}: ${(input.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
}
console.log(`art: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);

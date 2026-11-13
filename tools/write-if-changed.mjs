/**
 * Writes a generated file only when what it shows has really changed.
 *
 * Generated screenshots and PDFs live in the repository. A browser never
 * renders the same page to the same bytes twice (a few pixels of antialiasing
 * differ, a PDF carries its print time), so a tool that simply rewrites them
 * makes the repository grow by their full size at every run, with nothing new
 * to see.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Writes `data` to `path` unless the file is already the same.
 * `same(old, new)` decides (it may be async); byte equality by default.
 * @returns {Promise<boolean>} whether the file was written.
 */
export async function writeIfChanged(path, data, same = (a, b) => a.equals(b)) {
  const next = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (existsSync(path)) {
    const old = readFileSync(path);
    if (old.equals(next) || await same(old, next)) return false;
  }
  writeFileSync(path, next);
  return true;
}

/**
 * Compares two images as a person would see them, in a browser page: same
 * size, and no more than `maxShare` of the pixels differing by more than
 * `tolerance` (out of 255) on any channel. Rendering noise passes; a changed
 * label or layout does not.
 */
export function sameImage(page, { tolerance = 24, maxShare = 0.002, type = 'image/jpeg' } = {}) {
  return (a, b) => page.evaluate(async ({ urls, tolerance, maxShare }) => {
    const pixels = async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const [x, y] = await Promise.all(urls.map(pixels));
    if (x.width !== y.width || x.height !== y.height) return false;
    let off = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      if (Math.abs(x.data[i] - y.data[i]) > tolerance || Math.abs(x.data[i + 1] - y.data[i + 1]) > tolerance || Math.abs(x.data[i + 2] - y.data[i + 2]) > tolerance) off++;
    }
    return off <= (x.data.length / 4) * maxShare;
  }, { urls: [a, b].map((buf) => `data:${type};base64,${buf.toString('base64')}`), tolerance, maxShare });
}

/** A short fingerprint of several pieces of content, in order. */
export function fingerprint(parts) {
  const h = createHash('sha256');
  for (const p of parts) h.update(p).update('\0');
  return h.digest('hex').slice(0, 32);
}

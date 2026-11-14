/**
 * Photos and scans before they leave the browser: which files are accepted,
 * how images are scaled, what is sent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isPdf, isImage, toBase64, fitWithin, prepareFiles } from '../src/core/files.js';

const file = (name, type, bytes = [1, 2, 3]) => ({ name, type, arrayBuffer: async () => new Uint8Array(bytes).buffer });

test('a PDF and an image are recognised by type or by name', () => {
  assert.ok(isPdf(file('a.pdf', '')));
  assert.ok(isPdf(file('a', 'application/pdf')));
  assert.ok(!isPdf(file('a.jpg', 'image/jpeg')));
  assert.ok(isImage(file('a', 'image/png')));
  assert.ok(isImage(file('IMG_1.HEIC', '')));
  assert.ok(!isImage(file('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')));
  assert.ok(!isImage(null));
});

test('base64 of a large buffer matches Node, chunk borders included', () => {
  const bytes = Uint8Array.from({ length: 0x8000 * 2 + 5 }, (_, i) => (i * 31) % 256);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
  assert.equal(toBase64(bytes.buffer), Buffer.from(bytes).toString('base64'));
  assert.equal(toBase64(new Uint8Array()), '');
});

test('an image is scaled down to the long side, never enlarged', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1568, height: 1176 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1176, height: 1568 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(10000, 1), { width: 1568, height: 1 });
});

test('a PDF is sent as it is', async () => {
  const out = await prepareFiles([file('scan.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46])]);
  assert.deepEqual(out, [{ type: 'application/pdf', data: Buffer.from('%PDF').toString('base64') }]);
});

test('an image becomes a scaled JPEG, on white, in the order given', async (t) => {
  const drawn = [];
  globalThis.createImageBitmap = async (f) => ({ width: f.w, height: f.h, close() { drawn.push(`closed ${f.name}`); } });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.w = w; this.h = h; }
    getContext() {
      const c = this;
      return { set fillStyle(v) { c.fill = v; }, fillRect() {}, drawImage() { drawn.push(`${c.w}x${c.h} on ${c.fill}`); } };
    }
    async convertToBlob({ type, quality }) { drawn.push(`${type} ${quality}`); return { arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer }; }
  };
  t.after(() => { delete globalThis.createImageBitmap; delete globalThis.OffscreenCanvas; });
  const out = await prepareFiles([{ ...file('p1.png', 'image/png'), w: 3136, h: 1568 }, { ...file('p2.jpg', 'image/jpeg'), w: 100, h: 50 }]);
  assert.deepEqual(out.map((f) => f.type), ['image/jpeg', 'image/jpeg']);
  assert.equal(out[0].data, Buffer.from([0xff, 0xd8, 0xff]).toString('base64'));
  assert.deepEqual(drawn, ['1568x784 on #fff', 'image/jpeg 0.82', 'closed p1.png', '100x50 on #fff', 'image/jpeg 0.82', 'closed p2.jpg']);
});

test('a file that is neither, or an image the browser cannot decode, is refused', async (t) => {
  await assert.rejects(prepareFiles([file('a.docx', 'application/msword')]), (e) => e.code === 'file_type');
  globalThis.createImageBitmap = async () => { throw new Error('decode'); };
  t.after(() => { delete globalThis.createImageBitmap; });
  await assert.rejects(prepareFiles([file('a.heic', 'image/heic')]), (e) => e.code === 'file_type');
});

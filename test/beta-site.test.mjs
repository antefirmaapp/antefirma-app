/**
 * beta.antefirma.app and its packages: the ZIP writer produces valid,
 * reproducible archives, and the built page offers files that exist and match
 * the checksums it shows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 } from 'node:zlib';

import { zipEntries } from '../tools/zip.mjs';
import { TEXT } from '../beta-site/text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads a ZIP through its central directory and checks every entry's CRC. */
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    out.set(name, data);
    p += 46 + nlen + elen + clen;
  }
  return out;
}

test('zip: round trip, stored and deflated entries, UTF-8 names', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('ciao '.repeat(200)) },
    { name: 'dir/è.bin', data: Buffer.from([1, 2, 3]) },
    { name: 'empty', data: Buffer.alloc(0) },
  ];
  const files = unzip(zipEntries(entries));
  assert.deepEqual([...files.keys()], entries.map((e) => e.name));
  for (const e of entries) assert.deepEqual(files.get(e.name), e.data);
});

test('zip: the same input always gives the same bytes', () => {
  const entries = [{ name: 'x', data: Buffer.from('same') }];
  assert.deepEqual(zipEntries(entries), zipEntries(entries));
});

test('dev page texts: Italian and English have the same keys and list lengths', () => {
  const shape = (o) => JSON.stringify(o, (k, v) => (typeof v === 'string' ? '' : Array.isArray(v) ? v.map(() => (Array.isArray(v[0]) ? ['', ''] : '')) : v));
  assert.equal(shape(TEXT.it), shape(TEXT.en));
});

test('dev site build: pages, downloads and checksums agree', () => {
  const out = mkdtempSync(join(tmpdir(), 'beta-site-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools', 'beta-site-build.mjs'), out], { cwd: ROOT, stdio: 'ignore' });
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    const versions = JSON.parse(readFileSync(join(out, 'versions.json'), 'utf8'));
    assert.equal(versions.version, manifest.version);

    for (const [kind, f] of Object.entries(versions.files)) {
      const file = join(out, new URL(f.url).pathname);
      const latest = join(out, new URL(f.latest).pathname);
      const data = readFileSync(file);
      assert.equal(data.length, f.size, `${kind} size`);
      assert.equal(createHash('sha256').update(data).digest('hex'), f.sha256, `${kind} sha256`);
      assert.deepEqual(readFileSync(latest), data, `${kind} latest is the same file`);
      const names = [...unzip(data).keys()];
      const prefix = kind === 'safari' ? 'safari/' : '';
      assert.ok(names.includes(`${prefix}manifest.json`), `${kind} has a manifest at the expected place`);
      const m = JSON.parse(unzip(data).get(`${prefix}manifest.json`));
      assert.equal(m.version, manifest.version);
      if (kind === 'chrome') assert.ok(m.key, 'the developer package carries the fixed key');
      if (kind === 'safari') assert.equal(m.side_panel, undefined, 'Safari has no side panel');
    }

    for (const page of ['index.html', 'en/index.html']) {
      const html = readFileSync(join(out, page), 'utf8');
      assert.match(html, /<meta name="robots" content="noindex">/);
      assert.ok(!/\{(v|id)\}/.test(html), `${page}: every placeholder is filled`);
      assert.ok(html.includes(versions.extensionId), `${page}: shows the extension ID`);
      for (const f of Object.values(versions.files)) {
        assert.ok(html.includes(new URL(f.url).pathname), `${page} links ${f.url}`);
        assert.ok(html.includes(`data-copy="${f.sha256}"`), `${page} shows the checksum`);
      }
      // Local links point at files that exist.
      for (const [, href] of html.matchAll(/(?:href|src)="((?:\/|\.\.\/)?[a-z][^"#:]*)"/g)) {
        const rel = href.replace(/^\.\.\//, '').replace(/^\//, '');
        const p = join(out, rel || 'index.html');
        assert.ok(existsSync(p) || existsSync(join(p, 'index.html')), `${page}: ${href} exists`);
      }
      // Anchors point at ids on the same page.
      for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `${page}: #${id}`);
    }
    assert.match(readFileSync(join(out, '_headers'), 'utf8'), /Content-Security-Policy: default-src 'none'/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

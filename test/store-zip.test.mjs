/**
 * The store package (tools/store-zip.mjs): what the Chrome Web Store and Edge
 * Add-ons receive — the extension and nothing else, with no fixed key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildStoreZip } from '../tools/store-zip.mjs';

test('the store ZIP holds the extension only, with no fixed key', () => {
  const { zip, version } = buildStoreZip();
  assert.ok(existsSync(zip) && statSync(zip).size > 100_000);
  const stage = join(zip, '..', 'antefirma-store');
  const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.key, undefined, 'each store assigns its own ID');
  assert.equal(manifest.version_name, undefined, 'no "dev" label');
  for (const p of ['src/background/service-worker.js', 'src/content/detector.js', '_locales/it/messages.json']) assert.ok(existsSync(join(stage, p)), p);
  for (const p of ['test', 'demo', 'tools', 'web', 'node_modules', 'package.json']) assert.ok(!existsSync(join(stage, p)), p);
});

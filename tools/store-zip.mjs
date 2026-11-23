/**
 * The package to upload to the Chrome Web Store and to Microsoft Edge Add-ons.
 *
 *     node tools/store-zip.mjs        →  dist/antefirma-<version>.zip
 *
 * Unlike the testers' package (dev-zip.mjs) the manifest carries no fixed key:
 * each store assigns its own extension ID, which then goes into the server's
 * ALLOWED_ORIGINS. Only what the extension runs is packed: `src`, `_locales`
 * and the manifest — no tests, demo pages or tools. Firefox has its own build
 * (firefox-build.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFolder } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Builds the store ZIP and returns `{ zip, version }`. */
export function buildStoreZip() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  if (manifest.key) throw new Error('manifest.json must not carry a key: the stores assign the ID');
  const stage = join(ROOT, 'dist', 'antefirma-store');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(stage, p), { recursive: true });
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const zip = join(ROOT, 'dist', `antefirma-${manifest.version}.zip`);
  writeFileSync(zip, zipFolder(stage));
  return { zip, version: manifest.version };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log(buildStoreZip().zip);

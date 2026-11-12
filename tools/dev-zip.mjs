/**
 * The package for developers and testers: a ZIP to load in Chrome or Edge with
 * "Load unpacked", without going through git.
 *
 *     node tools/dev-zip.mjs          →  dist/antefirma-dev-<version>.zip
 *
 * A fixed public key goes into the package's manifest: so the extension always
 * has the same ID (DEV_ID below), whoever installs it and in whatever folder, and
 * the server recognises it (ALLOWED_ORIGINS) once and for all. The private key
 * isn't needed to load the extension and is not kept.
 *
 * The repository's manifest stays without a key: the Chrome Web Store version
 * gets the ID the store assigns.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEV_KEY, DEV_ID } from './dev-zip-key.mjs';
import { zipFolder } from './zip.mjs';

export { DEV_KEY, DEV_ID };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Builds the developer ZIP and returns its path. */
export function buildDevZip() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  const stage = join(ROOT, 'dist', 'antefirma-dev');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(stage, p), { recursive: true });
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify({ ...manifest, key: DEV_KEY, version_name: `${version} dev` }, null, 2) + '\n');
  writeFileSync(join(stage, 'README.txt'), [
    `AnteFirma ${version} · developer and tester build`,
    '',
    'Installing in Chrome (or Edge):',
    '1. Extract this ZIP into a folder you will not move.',
    '2. Open chrome://extensions (in Edge: edge://extensions).',
    '3. Turn on "Developer mode".',
    '4. "Load unpacked" → choose the folder that contains manifest.json.',
    '',
    `The extension ID is always ${DEV_ID}: the AnteFirma server recognises it.`,
    '',
    'Updating: download the new ZIP from https://dev.antefirma.app/en/, replace the folder\'s content,',
    'then press "Reload" on the AnteFirma card in chrome://extensions.',
    '',
  ].join('\n'));
  const zip = join(ROOT, 'dist', `antefirma-dev-${version}.zip`);
  writeFileSync(zip, zipFolder(stage));
  return zip;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log(buildDevZip());

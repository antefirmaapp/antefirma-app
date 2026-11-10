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
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtj0+rq588eBSOSmmoChspyyBi0O0/YZbSa9SwAPsfT23PtaiBBWCRziUtNWFwXugqhhKgI5dWeV5sLrHR7FOFUQhKTtBRhL9YkB3IyJN1YHqJh/K6sPC7DpxZX3LmU6R+VhbNT8ZHBpEq/RP76+qMdsjePKJy2nrqKOb6A8gt5LLcZpcOfH1oz+gf10N8t5SxVeB5BihgPA7KhorOisKOXDgSGUs8XzP+Cfe1OgdkjUUvKukhA1tEP/WXDrJfNwmwrZWK5+byGHtQvkM/iUHMWd95NM5UawRHSKOFadW2v1IgP0GdH9ekl48jaiFqyRYCl6EMqIlvyLrcb4xg0UQpwIDAQAB';
export const DEV_ID = 'alfaikbfkaimaejlhghbjffihjgoigoh';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const stage = join(ROOT, 'dist', 'antefirma-dev');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(stage, p), { recursive: true });
writeFileSync(join(stage, 'manifest.json'), JSON.stringify({ ...manifest, key: DEV_KEY, version_name: `${version} sviluppo` }, null, 2) + '\n');
writeFileSync(join(stage, 'LEGGIMI.txt'), [
  `AnteFirma ${version} · versione per sviluppatori e tester`,
  '',
  'Installazione in Chrome (o Edge):',
  '1. Estrai questo ZIP in una cartella che non sposterai.',
  '2. Apri chrome://extensions (in Edge: edge://extensions).',
  '3. Attiva «Modalità sviluppatore».',
  '4. «Carica estensione non pacchettizzata» → scegli la cartella che contiene manifest.json.',
  '',
  `L'ID dell'estensione è sempre ${DEV_ID}: il server di AnteFirma lo riconosce.`,
  '',
  'Aggiornare: scarica il nuovo ZIP dal pannello, sostituisci il contenuto della cartella,',
  'poi in chrome://extensions premi il pulsante «Ricarica» sulla scheda di AnteFirma.',
  '',
].join('\n'));
const zip = join(ROOT, 'dist', `antefirma-dev-${version}.zip`);
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: stage });
console.log(zip);

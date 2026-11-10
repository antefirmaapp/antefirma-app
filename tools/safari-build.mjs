/**
 * L'estensione per Safari (macOS): prepara la cartella da dare al convertitore di Apple.
 *
 *     node tools/safari-build.mjs          →  dist/safari/
 *
 * Safari esegue le stesse web extension di Chrome, con tre differenze che
 * contano qui:
 *  - non c'è il pannello laterale: il pannello si apre come finestrella del
 *    pulsante nella barra (action.default_popup) e, dal menu contestuale, in una scheda;
 *  - non c'è l'API delle notifiche: i promemoria restano nel pannello e nel
 *    calendario (.ics), che è comunque il canale che consigliamo;
 *  - ogni installazione ha un'origine sua (safari-web-extension://<uuid>): il
 *    server la accetta con ALLOW_SAFARI=1.
 *
 * Il pacchetto vero si costruisce su un Mac con Xcode (vedi README, «Safari»):
 *
 *     xcrun safari-web-extension-converter dist/safari --project-location safari-xcode \
 *       --app-name AnteFirma --bundle-identifier app.antefirma.safari --macos-only --copy-resources
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'safari');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(OUT, p), { recursive: true });

const UNSUPPORTED = new Set(['sidePanel', 'notifications', 'unlimitedStorage']);
const safari = {
  ...manifest,
  permissions: manifest.permissions.filter((p) => !UNSUPPORTED.has(p)),
  action: { ...manifest.action, default_popup: 'src/sidepanel/sidepanel.html' },
  browser_specific_settings: { safari: { strict_min_version: '16.4' } },
};
delete safari.side_panel;
delete safari.minimum_chrome_version;
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(safari, null, 2) + '\n');

// Nella finestrella del pulsante il pannello ha bisogno di una larghezza: in Safari è il contenuto a darla.
const css = join(OUT, 'src', 'sidepanel', 'sidepanel.css');
writeFileSync(css, readFileSync(css, 'utf8') + '\n/* Safari: il pannello vive nella finestrella del pulsante. */\nhtml { min-width: 400px; min-height: 560px; }\n');

console.log(`dist/safari pronto (versione ${manifest.version}). Su un Mac: vedi README, sezione «Safari».`);

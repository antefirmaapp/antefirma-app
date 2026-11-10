/**
 * The Safari (macOS) extension: prepares the folder to give to Apple's converter.
 *
 *     node tools/safari-build.mjs          →  dist/safari/
 *
 * Safari runs the same web extensions as Chrome, with three differences that
 * matter here:
 *  - there is no side panel: the panel opens as the toolbar button's popup
 *    (action.default_popup) and, from the context menu, in a tab;
 *  - there is no notifications API: reminders stay in the panel and in the
 *    calendar (.ics), which is the channel we recommend anyway;
 *  - every installation has its own origin (safari-web-extension://<uuid>): the
 *    server accepts it with ALLOW_SAFARI=1.
 *
 * The real package is built on a Mac with Xcode (see README, "Safari"):
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

// In the button's popup the panel needs a width: in Safari the content provides it.
const css = join(OUT, 'src', 'sidepanel', 'sidepanel.css');
writeFileSync(css, readFileSync(css, 'utf8') + '\n/* Safari: the panel lives in the toolbar button popup. */\nhtml { min-width: 400px; min-height: 560px; }\n');

console.log(`dist/safari ready (version ${manifest.version}). On a Mac: see README, "Safari".`);

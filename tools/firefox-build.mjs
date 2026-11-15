/**
 * The Firefox extension: the same code, with the manifest Firefox expects.
 *
 *     node tools/firefox-build.mjs          →  dist/firefox/
 *
 * Firefox runs Manifest V3 extensions with these differences:
 *  - the background is an event page (`background.scripts`), not a service worker;
 *  - there is no side panel API: the panel is a sidebar (`sidebar_action`),
 *    opened by the toolbar button and from the context menu;
 *  - settings are declared with `options_ui`;
 *  - notifications have no buttons (see notify() in background/commitments.js);
 *  - every installation has its own origin (moz-extension://<uuid>): the
 *    server accepts it with ALLOW_FIREFOX=1;
 *  - the manifest names the add-on (`gecko.id`) and declares what data leaves
 *    the browser (`data_collection_permissions`), which Mozilla shows at install.
 *
 * Firefox 128 or later: from 127 the sites an extension asks for are granted
 * at installation, as in Chrome, so the warning works without a second step.
 *
 * To try it: about:debugging → This Firefox → Load Temporary Add-on →
 * dist/firefox/manifest.json. A signed package comes from addons.mozilla.org.
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GECKO_ID = 'antefirma@antefirma.app';

/** The Chrome manifest, turned into the Firefox one. */
export function firefoxManifest(manifest) {
  const out = {
    ...manifest,
    permissions: manifest.permissions.filter((p) => p !== 'sidePanel'),
    background: { scripts: [manifest.background.service_worker], type: 'module' },
    sidebar_action: {
      default_panel: manifest.side_panel.default_path,
      default_title: 'AnteFirma',
      default_icon: { 16: manifest.icons['16'], 32: manifest.icons['32'] },
      open_at_install: false,
    },
    options_ui: { page: manifest.options_page, open_in_tab: true },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '128.0',
        // The terms on the page and the page address go to the server when a
        // button that commits is pressed, after consent.
        data_collection_permissions: { required: ['websiteContent', 'browsingActivity'] },
      },
    },
  };
  delete out.side_panel;
  delete out.options_page;
  delete out.minimum_chrome_version;
  return out;
}

export function buildFirefox(out = join(ROOT, 'dist', 'firefox')) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(out, p), { recursive: true });
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(firefoxManifest(manifest), null, 2) + '\n');
  return { out, version: manifest.version };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = buildFirefox();
  console.log(`dist/firefox ready (version ${version}). In Firefox: about:debugging → This Firefox → Load Temporary Add-on.`);
}

/** The Firefox build: the manifest Firefox expects, from the one manifest of the extension. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { firefoxManifest, buildFirefox, GECKO_ID } from '../tools/firefox-build.mjs';

const chrome = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('the Firefox manifest: event page, sidebar, options_ui, add-on id', () => {
  const m = firefoxManifest(chrome);
  assert.deepEqual(m.background, { scripts: ['src/background/service-worker.js'], type: 'module' });
  assert.equal(m.side_panel, undefined);
  assert.ok(!m.permissions.includes('sidePanel'));
  assert.equal(m.sidebar_action.default_panel, 'src/sidepanel/sidepanel.html');
  assert.equal(m.sidebar_action.open_at_install, false);
  assert.deepEqual(m.options_ui, { page: 'src/options/options.html', open_in_tab: true });
  assert.equal(m.options_page, undefined);
  assert.equal(m.minimum_chrome_version, undefined);
  assert.equal(m.browser_specific_settings.gecko.id, GECKO_ID);
  assert.ok(Number(m.browser_specific_settings.gecko.strict_min_version) >= 128, 'sites are granted at installation from 127');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.required, ['websiteContent', 'browsingActivity']);
});

test('everything else is the same extension', () => {
  const m = firefoxManifest(chrome);
  for (const key of ['manifest_version', 'version', 'name', 'content_scripts', 'host_permissions', 'icons', 'default_locale', 'web_accessible_resources', 'content_security_policy', 'action'])
    assert.deepEqual(m[key], chrome[key], key);
  for (const p of ['storage', 'alarms', 'notifications', 'contextMenus', 'scripting', 'activeTab']) assert.ok(m.permissions.includes(p), p);
  assert.equal(chrome.side_panel.default_path, 'src/sidepanel/sidepanel.html', 'the source manifest is not touched');
});

test('the build writes a loadable folder', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'af-firefox-')), 'firefox');
  const { version } = buildFirefox(out);
  assert.equal(version, chrome.version);
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(m.browser_specific_settings.gecko.id, GECKO_ID);
  for (const f of [m.background.scripts[0], m.sidebar_action.default_panel, m.options_ui.page, '_locales/it/messages.json', ...m.content_scripts[0].js])
    assert.ok(existsSync(join(out, f)), f);
});

test('the code has a path for Firefox where Chrome\'s API is missing', () => {
  const sw = readFileSync(new URL('../src/background/service-worker.js', import.meta.url), 'utf8');
  assert.match(sw, /sidebarAction/);
  assert.match(sw, /sidebar\.toggle\(\)/);
  const c = readFileSync(new URL('../src/background/commitments.js', import.meta.url), 'utf8');
  assert.match(c, /PLAIN_NOTIFICATIONS \? \{\} : \{/, 'no buttons in Firefox notifications');
});

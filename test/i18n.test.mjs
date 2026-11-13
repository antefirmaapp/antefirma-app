/**
 * Languages. Code refers to texts by id (`t('goBack')`); the texts live in
 * src/i18n/locales/{it,en,es,de,fr,nl}.json. These tests make sure that:
 * - every id used in the code exists, in all six languages;
 * - the six files have exactly the same ids and the same placeholders;
 * - messages.js is up to date with the JSON files;
 * - every text of the HTML pages (written in Italian) has an id;
 * - no id is left unused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, tn, tIn, setLang, resolveLang } from '../src/i18n/index.js';
import { buildMessages, buildBootMessages, BOOT_IDS } from '../tools/i18n-build.mjs';

const LANGS = ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no', 'sk', 'hu', 'el', 'hr', 'sl', 'bg', 'lt', 'lv', 'et'];
const L = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(`src/i18n/locales/${l}.json`, 'utf8'))]));
const ids = Object.keys(L.it);

function files(dir, ext) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
const SOURCES = [...files('src', '.js'), ...files('web', '.js')].filter((f) => !f.includes('src/i18n/'));
const code = Object.fromEntries(SOURCES.map((f) => [f, readFileSync(f, 'utf8')]));

/** The ids inside t('…'), tn(n, '…', '…') and tIn(lang, '…'). */
function idsIn(src) {
  const out = [];
  for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9]+)'/g)) out.push(m[1]);
  for (const m of src.matchAll(/\btn\([^,]+,\s*'([A-Za-z0-9]+)'\s*,\s*'([A-Za-z0-9]+)'/g)) out.push(m[1], m[2]);
  for (const m of src.matchAll(/\b(?:tIn|tw)\([^)]*?'([A-Za-z0-9]+)'/g)) out.push(m[1]);
  return out;
}
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every id used in the code exists in the locale files', () => {
  const missing = [];
  for (const [f, src] of Object.entries(code)) for (const id of idsIn(src)) if (!(id in L.it)) missing.push(`${f}: ${id}`);
  assert.deepEqual(missing, []);
});

test('all locale files have the same ids, non-empty texts and the same placeholders', () => {
  for (const l of LANGS.slice(1)) assert.deepEqual(Object.keys(L[l]).sort(), [...ids].sort(), `${l}.json ids differ from it.json`);
  const bad = [];
  for (const id of ids) {
    for (const l of LANGS) if (!String(L[l][id] || '').trim()) bad.push(`${l}: ${id} empty`);
    for (const l of LANGS.slice(1)) if (vars(L[l][id]) !== vars(L.it[id])) bad.push(`placeholders: ${l} ${id}`);
  }
  assert.deepEqual(bad, []);
});

test('ids are English camelCase', () => {
  assert.deepEqual(ids.filter((id) => !/^[a-z][A-Za-z0-9]*$/.test(id)), []);
});

test('messages.js is generated from the current locale files', () => {
  assert.equal(readFileSync('src/i18n/messages.js', 'utf8'), buildMessages(), 'run node tools/i18n-build.mjs');
});

test('messages-boot.js is generated from the current locale files', () => {
  assert.equal(readFileSync('src/i18n/messages-boot.js', 'utf8'), buildBootMessages(), 'run node tools/i18n-build.mjs');
});

test('content scripts carry only the boot texts: a page pays little for the extension', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const js = manifest.content_scripts.flatMap((c) => c.js);
  assert.ok(js.includes('src/i18n/messages-boot.js'));
  assert.ok(!js.includes('src/i18n/messages.js'), 'every text in every language must not be injected into pages');
  const bytes = js.reduce((n, f) => n + readFileSync(f).length, 0);
  // Injected into every page and every frame: 1.57 MB before the texts were split.
  assert.ok(bytes < 260_000, `content scripts weigh ${bytes} bytes`);
});

test('the boot texts cover what a content script shows when the service worker is unreachable', () => {
  // The error card and the countdown announcement of overlay.js, and the bridge's own errors.
  const overlay = readFileSync('src/content/overlay.js', 'utf8');
  const errorCard = overlay.slice(overlay.indexOf('    showError('), overlay.indexOf('    armProceed('));
  const release = overlay.slice(overlay.indexOf('    releaseProceed('), overlay.indexOf('    bind('));
  const bridge = readFileSync('src/content/bridge.js', 'utf8');
  const needed = [...`${errorCard}\n${release}\n${bridge}`.matchAll(/\bt\('([A-Za-z0-9]+)'/g)].map((m) => m[1]);
  assert.ok(needed.length >= 9, 'the texts were found in the source');
  assert.deepEqual(needed.filter((id) => !BOOT_IDS.includes(id)), []);
  assert.ok(BOOT_IDS.includes('errorDuringAnalysis'), 'the detector\'s fallback error');
  for (const id of BOOT_IDS) for (const l of LANGS) assert.equal(typeof L[l][id], 'string', `${id} in ${l}`);
});

test('every id is used somewhere (code, vocabularies or HTML pages)', () => {
  const all = Object.values(code).join('\n');
  const html = ['src/options/options.html', 'src/sidepanel/sidepanel.html', 'src/welcome/welcome.html'].map((f) => readFileSync(f, 'utf8').replace(/&#10;/g, ' ').replace(/\s+/g, ' ')).join('\n');
  const unused = ids.filter((id) => { const v = L.it[id].replace(/\s+/g, ' '); return !all.includes(`'${id}'`) && !html.includes(v.replace(/&/g, '&amp;')) && !html.includes(v); });
  assert.deepEqual(unused, []);
});

test('t(), tn(), tIn(): language, placeholders, fallbacks', () => {
  setLang('en');
  assert.equal(t('cancelWithinNDays', { n: 5 }), 'Cancel within 5 days');
  assert.equal(t('noSuchId'), 'noSuchId');
  assert.equal(tn(1, 'nDay', 'nDays2'), '1 day');
  setLang('es');
  assert.equal(t('goBack'), 'Volver atrás');
  assert.equal(tIn('it', 'goBack'), 'Torna indietro');
  setLang('xx');
  assert.equal(t('goBack'), 'Torna indietro');
  assert.equal(resolveLang('auto', 'es-ES'), 'es');
  assert.equal(resolveLang('auto', 'de-DE'), 'de');
  assert.equal(resolveLang('auto', 'nl-BE'), 'nl');
  assert.equal(resolveLang('auto', 'pt-BR'), 'pt');
  assert.equal(resolveLang('auto', 'pl-PL'), 'pl');
  assert.equal(resolveLang('auto', 'sv-SE'), 'sv');
  assert.equal(resolveLang('auto', 'da-DK'), 'da');
  assert.equal(resolveLang('auto', 'nb-NO'), 'no');
  assert.equal(resolveLang('auto', 'nn'), 'no');
  assert.equal(resolveLang('auto', 'is-IS'), 'en');
  assert.equal(resolveLang('auto', 'sk-SK'), 'sk');
  assert.equal(resolveLang('auto', 'hu'), 'hu');
  assert.equal(resolveLang('auto', 'el-GR'), 'el');
  setLang('fr');
  assert.equal(t('goBack'), tIn('fr', 'goBack'));
  assert.notEqual(tIn('fr', 'goBack'), tIn('en', 'goBack'));
  assert.equal(resolveLang('it', 'en-US'), 'it');
  setLang('it');
});

test('labels and texts of the vocabularies are ids with translations', async () => {
  const { RISK_CATEGORIES, LEVELS, ACTION_LABELS, PROTECTION_LABELS } = await import('../src/core/constants.js');
  const { LETTER_LABELS } = await import('../src/core/letter.js');
  const { runConsumerChecks } = await import('../src/core/eu.js');
  const all = [
    ...Object.values(RISK_CATEGORIES).flatMap((c) => [c.label, c.why]),
    ...LEVELS.flatMap((l) => [l.label, l.headline]),
    ...Object.values(ACTION_LABELS), ...Object.values(PROTECTION_LABELS), ...Object.values(LETTER_LABELS),
  ];
  // Protections: all the checks, with a text that triggers all or almost all of them.
  const text = 'arbitrato foro competente rinuncia azioni collettive modifica unilaterale responsabilità nessun rimborso rinnovo tacito vendita dati terze parti addestrare';
  const findings = Object.keys(RISK_CATEGORIES).map((category) => ({ category, severity: 50 }));
  const r = runConsumerChecks({ text, findings, ctx: { form: { bundledConsent: true, precheckedConsents: 1 } }, cost: { notice: { months: 3 }, hasAutoRenewal: true }, actionType: 'purchase', jurisdiction: 'IT' });
  assert.deepEqual(all.filter((s) => s && !(s in L.it)), []);
  // The consumer checks come back already translated (current language: Italian).
  const texts = new Set(Object.values(L.it));
  assert.deepEqual([r.disclaimer, ...r.flags.flatMap((f) => [f.title, f.note])].filter((s) => s && !texts.has(s)), []);
});

test('the HTML pages\' texts all have an id', () => {
  const missing = [];
  const skip = /^(AnteFirma\*?|PDF|Max|Team|Pro|AF-X{4}(-X{4}){3}|Italiano|English|Español|Deutsch|Français|Nederlands|Polski|Português|Svenska|Română|Čeština|Dansk|Suomi|Norsk|Slovenčina|Magyar|Ελληνικά|Hrvatski|Slovenščina|Български|Lietuvių|Latviešu|Eesti|https?:\/\/\S+)$/;
  for (const f of ['src/options/options.html', 'src/sidepanel/sidepanel.html', 'src/welcome/welcome.html']) {
    const html = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|textarea)[\s\S]*?<\/\1>/g, '');
    const texts = [
      ...[...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]),
      ...[...html.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]+)"/g)].map((m) => m[1]),
    ].map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[A-Za-zÀ-ú]{2,}/.test(s) && !skip.test(s));
    for (const s of texts) if (!globalThis.AF_I18N.idOf(s.replace(/&amp;/g, '&'))) missing.push(`${f}: ${s}`);
  }
  assert.deepEqual(missing, []);
});

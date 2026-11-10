/** Il «?»: gli indirizzi della guida esistono davvero nel sito (se il sito è accanto). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { helpUrl, HELP_TOPICS } from '../src/core/help.js';

test('helpUrl: lingua, argomento, indice e lingua sconosciuta', () => {
  assert.equal(helpUrl('lettera', 'it'), 'https://antefirma.app/aiuto/lettera-di-disdetta/');
  assert.equal(helpUrl('lettera', 'es'), 'https://antefirma.app/es/ayuda/carta-de-baja/');
  assert.equal(helpUrl('', 'en'), 'https://antefirma.app/en/help/');
  assert.equal(helpUrl('piani', 'de'), 'https://antefirma.app/aiuto/piani-e-chiave/');
});

const SITE = new URL('../../antefirma-site/help.mjs', import.meta.url);
test('gli argomenti e gli slug sono quelli del centro di aiuto', { skip: !existsSync(SITE) && 'sito non presente' }, async () => {
  const { ARTICLES, helpPaths } = await import(SITE.href);
  assert.deepEqual([...HELP_TOPICS].sort(), ARTICLES.map((a) => a.key).sort());
  for (const k of HELP_TOPICS) for (const l of ['it', 'en', 'es']) assert.equal(helpUrl(k, l), `https://antefirma.app${helpPaths(k)[l]}`);
});

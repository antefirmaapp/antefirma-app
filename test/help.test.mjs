/** The "?": help addresses really exist on the website (when the website is checked out next to it). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { helpUrl, HELP_TOPICS } from '../src/core/help.js';

test('helpUrl: language, topic, index and unknown language', () => {
  assert.equal(helpUrl('letter', 'it'), 'https://antefirma.app/aiuto/lettera-di-disdetta/');
  assert.equal(helpUrl('letter', 'es'), 'https://antefirma.app/es/ayuda/carta-de-baja/');
  assert.equal(helpUrl('', 'en'), 'https://antefirma.app/en/help/');
  assert.equal(helpUrl('letter', 'de'), 'https://antefirma.app/de/hilfe/kuendigungsschreiben/');
  assert.equal(helpUrl('', 'nl'), 'https://antefirma.app/nl/hulp/');
  assert.equal(helpUrl('plans', 'sv'), 'https://antefirma.app/sv/hjalp/abonnemang-och-nyckel/');
  assert.equal(helpUrl('plans', 'hu'), 'https://antefirma.app/en/help/plans-and-keys/', 'a language without help pages reads the English ones');
});

const SITE = new URL('../../antefirma-site/help.mjs', import.meta.url);
test('topics and slugs are those of the help centre', { skip: !existsSync(SITE) && 'website not checked out' }, async () => {
  const { ARTICLES, helpPaths } = await import(SITE.href);
  assert.deepEqual([...HELP_TOPICS].sort(), ARTICLES.map((a) => a.key).sort());
  for (const k of HELP_TOPICS) for (const l of ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no']) assert.equal(helpUrl(k, l), `https://antefirma.app${helpPaths(k)[l]}`);
});

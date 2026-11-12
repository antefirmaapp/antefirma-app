/**
 * Regression net for the refactoring: the visible outputs of the extension,
 * compared with approved copies in test/golden/.
 *
 * - every corpus contract, analysed with its recorded server response:
 *   level, cost, timeline, headline, findings (the numbers a user sees);
 * - the cancellation letter: 3 languages × 3 kinds;
 * - the calendar file (.ics);
 * - the panel's result HTML in Italian, English and Spanish.
 */
import test from 'node:test';
import { golden } from './golden.mjs';
import { CORPUS } from './fixtures/corpus.mjs';
import { RESPONSES } from './fixtures/responses.mjs';
import { analyze } from '../src/core/analyzer.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { buildCommitment } from '../src/core/commitments.js';
import { buildLetter, LETTER_KINDS, LETTER_VARIANTS } from '../src/core/letter.js';
import { buildIcs } from '../src/core/ics.js';
import { renderVerdict } from '../src/sidepanel/render.js';
import { setLang } from '../src/i18n/index.js';

const T0 = new Date('2026-08-15T10:00:00Z').getTime();
const settings = (extra = {}) => ({ ...DEFAULT_SETTINGS, remoteConsentAt: '2026-08-01T00:00:00.000Z', ...extra });

async function verdictOf(c, lang = 'it') {
  setLang(lang);
  return analyze({
    text: c.text, ctx: { url: `https://${c.id}.test/checkout`, title: c.label, pricing: c.pricing || {}, terms: {}, form: {} },
    actionType: c.actionType, remote: async () => structuredClone(RESPONSES[c.id]),
    settings: settings({ profile: c.profile || DEFAULT_SETTINGS.profile, uiLang: lang }), now: T0,
  });
}

/** What a user sees, without timing and hashes that change on every run. */
const visible = (v) => ({
  level: v.level.id, score: v.score, headline: v.headline, summary: v.summary, mustRemember: v.mustRemember,
  cost: v.cost, timeline: v.timeline,
  findings: v.findings.map((f) => ({ category: f.category, severity: f.severity, quote: f.quote, title: f.title })),
  consumer: v.consumer,
});

test('corpus verdicts are unchanged', async () => {
  const out = {};
  for (const c of CORPUS) out[c.id] = visible(await verdictOf(c));
  golden('verdicts.json', out);
});

test('panel result HTML is unchanged in every language', async () => {
  const c = CORPUS.find((x) => x.pricing?.recurring) || CORPUS[0];
  for (const lang of ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no', 'sk', 'hu', 'el', 'hr', 'sl', 'bg']) {
    const v = await verdictOf(c, lang);
    v.engine.durationMs = 0; // timing differs on every run
    golden(`render-${lang}.html`, renderVerdict(v) + '\n');
  }
  setLang('it');
});

test('letters are unchanged: 20 language and country variants × 3 kinds', async () => {
  const c = CORPUS.find((x) => x.pricing?.recurring) || CORPUS[0];
  const commitment = buildCommitment({ verdict: await verdictOf(c), now: T0, id: 'golden-1' });
  const identity = { name: 'Mario Rossi', address: 'Via Roma 1, 20100 Milano', email: 'mario.rossi@example.com', customerId: 'C-42' };
  for (const lang of LETTER_VARIANTS) {
    for (const kind of Object.values(LETTER_KINDS)) {
      const l = buildLetter(commitment, identity, kind, T0, lang);
      golden(`letter-${lang}-${kind}.txt`, [l.subject, l.filename, '', l.text, '', ...l.checklist, '', ...(l.references || [])].join('\n') + '\n');
    }
  }
});

test('calendar file is unchanged', async () => {
  const c = CORPUS.find((x) => x.pricing?.recurring) || CORPUS[0];
  const commitment = buildCommitment({ verdict: await verdictOf(c), now: T0, id: 'golden-1' });
  const ics = buildIcs(commitment, { now: T0 });
  golden('calendar.ics', (typeof ics === 'string' ? ics : ics.content).replace(/\r\n/g, '\n'));
});

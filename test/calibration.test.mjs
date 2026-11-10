/**
 * Score calibration.
 *
 * The assertions are in order of decreasing robustness, on purpose:
 *
 *  1. **No saturation** — the scale must discriminate. It is the defect these
 *     tests were born to prevent: with the previous engine eight cases out of
 *     nine gave CRITICAL, including an honest SaaS with no lock-in.
 *  2. **Ordering** — a worse contract must come out worse. It holds however the
 *     thresholds move, and it is the product's real promise.
 *  3. **Blocks / doesn't block** — the behaviour the user experiences.
 *  4. **Exact band** — the weakest assertion, because it depends on nine
 *     hand-written labels. When texts from real sites arrive, this is the one
 *     to revise first.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyzer.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { shouldBlock, compressSeverity, aggregateSeverity, moneyPressure } from '../src/core/scoring.js';
import { multiplierFor } from '../src/core/profile.js';
import { CORPUS, ORDERING, BAND_ORDER } from './fixtures/corpus.mjs';
import { RESPONSES } from './fixtures/responses.mjs';

/** The server replaced by its recorded answer for that text. */
const recorded = (id) => async () => structuredClone(RESPONSES[id]);

const T0 = new Date('2026-08-15T10:00:00Z').getTime();

/** Analyses the whole corpus once: the tests then read from here. */
const scored = new Map();
for (const c of CORPUS) {
  const verdict = await analyze({
    text: c.text,
    ctx: { url: `https://${c.id}.test`, title: c.label, pricing: c.pricing || {}, terms: {}, form: {} },
    actionType: c.actionType,
    remote: recorded(c.id),
    settings: {
      ...DEFAULT_SETTINGS,
      profile: c.profile || DEFAULT_SETTINGS.profile,
    },
    now: T0,
  });
  scored.set(c.id, { ...c, verdict, score: verdict.score, band: verdict.level.id });
}

const get = (id) => scored.get(id);
const scores = [...scored.values()].map((s) => s.score);

// ── 1. the scale must discriminate ──────────────────────────────────────────

test('no case hits the cap: 100 stays unreachable', () => {
  for (const s of scored.values()) {
    assert.ok(s.score < 100, `${s.id} è saturo a ${s.score}`);
  }
});

test('scores are spread out, not piled up at the top', () => {
  const distinct = new Set(scores).size;
  const spread = Math.max(...scores) - Math.min(...scores);
  assert.ok(distinct >= 7, `solo ${distinct} valori distinti su ${scores.length} casi`);
  assert.ok(spread >= 60, `la scala usata è larga solo ${spread} punti`);

  // And at least four bands out of five must be used: if the corpus goes from
  // the newsletter to the predatory loan and everything ends up in two bands,
  // the level is saying nothing.
  const bands = new Set([...scored.values()].map((s) => s.band));
  assert.ok(bands.size >= 4, `usate solo ${bands.size} fasce: ${[...bands].join(', ')}`);
});

test('compression is monotonic and never reaches 100', () => {
  let previous = -1;
  for (let raw = 0; raw <= 400; raw += 5) {
    const v = compressSeverity(raw);
    assert.ok(v >= previous, `non monotona in ${raw}`);
    assert.ok(v < 100, `compressSeverity(${raw}) = ${v}`);
    previous = v;
  }
  // Below the knee it must stay faithful: precision matters there.
  assert.equal(compressSeverity(30), 30);
  assert.equal(compressSeverity(50), 50);
});

test('a very serious clause weighs more than eight ordinary ones', () => {
  const severe = aggregateSeverity([{ severity: 90 }]);
  const many = aggregateSeverity(Array.from({ length: 8 }, () => ({ severity: 45 })));
  assert.ok(severe > many, `${severe} non supera ${many}`);
});

test('economic pressure tells orders of magnitude apart', () => {
  // The previous defect: €886 and €12,590 were four points apart.
  assert.ok(moneyPressure(12590) - moneyPressure(886) >= 12);
  assert.ok(moneyPressure(100) < moneyPressure(1000));
  assert.ok(moneyPressure(1000) < moneyPressure(10000));
});

// ── 2. ordinamento ──────────────────────────────────────────────────────────

test('a worse contract comes out worse', () => {
  for (const [worse, better] of ORDERING) {
    const a = get(worse);
    const b = get(better);
    assert.ok(
      a.score < b.score,
      `${worse} (${a.score}) dovrebbe stare sotto ${better} (${b.score})`
    );
  }
});

test('the main chain is ordered from start to end', () => {
  const chain = ['newsletter', 'saas_fair', 'ecommerce', 'saas_annual', 'telco_24m', 'predatory_loan'];
  const values = chain.map((id) => get(id).score);
  const ranked = [...values].sort((a, b) => a - b);
  assert.deepEqual(values, ranked, `ordine rotto: ${chain.map((id, i) => `${id}=${values[i]}`).join(' ')}`);
});

// ── 3. comportamento sperimentato dall'utente ───────────────────────────────

test('harmless cases don\'t interrupt the user', () => {
  for (const id of ['newsletter', 'saas_fair', 'cookie_banner']) {
    const s = get(id);
    assert.equal(
      shouldBlock(s.band, DEFAULT_SETTINGS.blockFrom),
      false,
      `${id} blocca il click con punteggio ${s.score}: è un falso allarme`
    );
  }
});

test('i casi gravi fermano l’utente', () => {
  for (const id of ['telco_24m', 'freelance_assignment', 'predatory_loan', 'saas_annual']) {
    const s = get(id);
    assert.equal(
      shouldBlock(s.band, DEFAULT_SETTINGS.blockFrom),
      true,
      `${id} non blocca il click pur avendo punteggio ${s.score}`
    );
  }
});

test('the most serious level is reserved for a single case', () => {
  const criticalOnes = [...scored.values()].filter((s) => s.band === 'critical');
  assert.equal(criticalOnes.length, 1, `troppi CRITICAL: ${criticalOnes.map((c) => c.id).join(', ')}`);
  assert.equal(criticalOnes[0].id, 'predatory_loan');
});

// ── 4. expected bands (the weakest assertion) ───────────────────────────────

test('ogni caso cade nella fascia etichettata a mano', () => {
  const failures = [];
  for (const c of CORPUS) {
    const s = get(c.id);
    if (s.band !== c.band) {
      failures.push(`${c.id}: atteso ${c.band}, ottenuto ${s.band} (${s.score})`);
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`);
});

test('the expected bands are legitimate values', () => {
  for (const c of CORPUS) {
    assert.ok(BAND_ORDER.includes(c.band), `fascia inesistente nel corpus: ${c.band}`);
  }
});

// ── 5. the profile shifts, but doesn't upend ────────────────────────────────

test('the creative profile raises the assignment contract, not the others', async () => {
  const withIp = { ...DEFAULT_SETTINGS, profile: { money: true, ip: true, freelance: true } };
  const withoutIp = { ...DEFAULT_SETTINGS, profile: { money: true } };

  const run = async (id, settings) => {
    const c = CORPUS.find((x) => x.id === id);
    const v = await analyze({
      text: c.text,
      ctx: { url: 'https://x.test', pricing: c.pricing || {}, terms: {}, form: {} },
      actionType: c.actionType,
      remote: recorded(c.id),
      settings,
      now: T0,
    });
    return v.score;
  };

  const assignmentWithIp = await run('freelance_assignment', withIp);
  const assignmentWithoutIp = await run('freelance_assignment', withoutIp);
  assert.ok(assignmentWithIp > assignmentWithoutIp, 'la cessione dei diritti deve pesare di più per chi vive del proprio lavoro');

  // On a contract that doesn't touch content, the creative profile must shift
  // almost nothing: if it did, it wouldn't be personalising.
  const telcoWithIp = await run('telco_24m', withIp);
  const telcoWithoutIp = await run('telco_24m', withoutIp);
  assert.ok(Math.abs(telcoWithIp - telcoWithoutIp) <= 2, `il profilo IP sposta la telco di ${Math.abs(telcoWithIp - telcoWithoutIp)} punti`);
});

// ── the high bands must be reachable without a price too ────────────────────

test('a serious contract without a price can reach HIGH RISK', async () => {
  // The cap for clauses alone was 75, with HIGH RISK at 76: for a user outside
  // the EU — who gets no contribution from the consumer engine — the two high
  // bands were *structurally* unreachable without an extractable price. A full
  // assignment of copyright came out as COMMITMENT.
  const c = CORPUS.find((x) => x.id === 'freelance_assignment');
  for (const jurisdiction of ['IT', 'US']) {
    const verdict = await analyze({
      text: c.text,
      ctx: { url: 'https://x.test', title: c.label, pricing: {}, terms: {}, form: {} },
      actionType: c.actionType,
      remote: recorded(c.id),
      settings: { ...DEFAULT_SETTINGS, jurisdiction, profile: c.profile },
      now: T0,
    });
    assert.ok(verdict.cost?.worstCase == null, 'questo caso deve restare senza prezzo');
    assert.ok(
      BAND_ORDER.indexOf(verdict.level.id) >= BAND_ORDER.indexOf('high_risk'),
      `con giurisdizione ${jurisdiction} esce ${verdict.level.id} (${verdict.score})`
    );
  }
});

test('the residual tells two clauses from seven', () => {
  const severe = { severity: 85 };
  const media = { severity: 45 };
  const due = aggregateSeverity([severe, media]);
  const four = aggregateSeverity([severe, media, media, media]);
  assert.ok(four > due, `quattro clausole (${four}) non pesano più di due (${due})`);
});

test('economic pressure still distinguishes above €15,000', () => {
  assert.ok(
    moneyPressure(200_000) > moneyPressure(15_000),
    'un mutuo da 200.000 € pesa quanto un finanziamento da 15.000 €'
  );
});

test('the default profile doesn\'t downgrade the assignment of rights', () => {
  // "the user didn't enable the area" is not "the user doesn't care": the
  // default profile doesn't contain `ip`, and the most serious category in the
  // dictionary was damped by 15% for almost every installation.
  const { multiplier } = multiplierFor('ip_assignment', DEFAULT_SETTINGS.profile);
  assert.ok(multiplier >= 1, `moltiplicatore ${multiplier} sul profilo predefinito`);
});

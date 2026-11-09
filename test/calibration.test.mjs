/**
 * Calibrazione del punteggio.
 *
 * Le asserzioni sono in ordine di robustezza decrescente, ed è voluto:
 *
 *  1. **Nessuna saturazione** — la scala deve distinguere. È il difetto che
 *     questi test sono nati per impedire: con il motore precedente otto casi
 *     su nove davano CRITICAL, compreso un SaaS onesto senza vincoli.
 *  2. **Ordinamento** — un contratto peggiore deve risultare peggiore. Vale
 *     comunque si spostino le soglie, ed è la promessa vera del prodotto.
 *  3. **Blocca / non blocca** — il comportamento che l'utente sperimenta.
 *  4. **Fascia esatta** — l'asserzione più debole, perché dipende da nove
 *     etichette scritte a mano. Quando arriveranno testi presi da siti veri,
 *     è questa che andrà rivista per prima.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyzer.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { shouldBlock, compressSeverity, aggregateSeverity, moneyPressure } from '../src/core/scoring.js';
import { multiplierFor } from '../src/core/profile.js';
import { CORPUS, ORDERING, BAND_ORDER } from './fixtures/corpus.mjs';

const T0 = new Date('2026-08-15T10:00:00Z').getTime();

/** Analizza tutto il corpus una volta sola: i test poi leggono da qui. */
const scored = new Map();
for (const c of CORPUS) {
  const verdict = await analyze({
    text: c.text,
    ctx: { url: `https://${c.id}.test`, title: c.label, pricing: c.pricing || {}, terms: {}, form: {} },
    actionType: c.actionType,
    settings: {
      ...DEFAULT_SETTINGS,
      useLLM: false,
      useLocalModel: false,
      profile: c.profile || DEFAULT_SETTINGS.profile,
    },
    now: T0,
  });
  scored.set(c.id, { ...c, verdict, score: verdict.score, band: verdict.level.id });
}

const get = (id) => scored.get(id);
const scores = [...scored.values()].map((s) => s.score);

// ── 1. la scala deve distinguere ────────────────────────────────────────────

test('nessun caso tocca il tetto: 100 resta irraggiungibile', () => {
  for (const s of scored.values()) {
    assert.ok(s.score < 100, `${s.id} è saturo a ${s.score}`);
  }
});

test('i punteggi sono distribuiti, non ammassati in alto', () => {
  const distinct = new Set(scores).size;
  const spread = Math.max(...scores) - Math.min(...scores);
  assert.ok(distinct >= 7, `solo ${distinct} valori distinti su ${scores.length} casi`);
  assert.ok(spread >= 60, `la scala usata è larga solo ${spread} punti`);

  // E devono essere usate almeno quattro fasce su cinque: se il corpus copre
  // dalla newsletter al finanziamento predatorio e finisce tutto in due
  // fasce, il livello non sta dicendo niente.
  const bands = new Set([...scored.values()].map((s) => s.band));
  assert.ok(bands.size >= 4, `usate solo ${bands.size} fasce: ${[...bands].join(', ')}`);
});

test('la compressione è monotona e non raggiunge mai 100', () => {
  let previous = -1;
  for (let raw = 0; raw <= 400; raw += 5) {
    const v = compressSeverity(raw);
    assert.ok(v >= previous, `non monotona in ${raw}`);
    assert.ok(v < 100, `compressSeverity(${raw}) = ${v}`);
    previous = v;
  }
  // Sotto il ginocchio deve restare fedele: lì la precisione serve.
  assert.equal(compressSeverity(30), 30);
  assert.equal(compressSeverity(50), 50);
});

test('una clausola gravissima pesa più di otto ordinarie', () => {
  const severe = aggregateSeverity([{ severity: 90 }]);
  const many = aggregateSeverity(Array.from({ length: 8 }, () => ({ severity: 45 })));
  assert.ok(severe > many, `${severe} non supera ${many}`);
});

test('la pressione economica distingue gli ordini di grandezza', () => {
  // Il difetto precedente: 886 € e 12.590 € distavano quattro punti.
  assert.ok(moneyPressure(12590) - moneyPressure(886) >= 12);
  assert.ok(moneyPressure(100) < moneyPressure(1000));
  assert.ok(moneyPressure(1000) < moneyPressure(10000));
});

// ── 2. ordinamento ──────────────────────────────────────────────────────────

test('un contratto peggiore risulta peggiore', () => {
  for (const [worse, better] of ORDERING) {
    const a = get(worse);
    const b = get(better);
    assert.ok(
      a.score < b.score,
      `${worse} (${a.score}) dovrebbe stare sotto ${better} (${b.score})`
    );
  }
});

test('la catena principale è ordinata dall’inizio alla fine', () => {
  const chain = ['newsletter', 'saas_fair', 'ecommerce', 'saas_annual', 'telco_24m', 'predatory_loan'];
  const values = chain.map((id) => get(id).score);
  const ranked = [...values].sort((a, b) => a - b);
  assert.deepEqual(values, ranked, `ordine rotto: ${chain.map((id, i) => `${id}=${values[i]}`).join(' ')}`);
});

// ── 3. comportamento sperimentato dall'utente ───────────────────────────────

test('i casi innocui non interrompono l’utente', () => {
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

test('il livello più grave è riservato a un caso solo', () => {
  const criticalOnes = [...scored.values()].filter((s) => s.band === 'critical');
  assert.equal(criticalOnes.length, 1, `troppi CRITICAL: ${criticalOnes.map((c) => c.id).join(', ')}`);
  assert.equal(criticalOnes[0].id, 'predatory_loan');
});

// ── 4. fasce attese (l'asserzione più debole) ───────────────────────────────

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

test('le fasce attese sono valori legittimi', () => {
  for (const c of CORPUS) {
    assert.ok(BAND_ORDER.includes(c.band), `fascia inesistente nel corpus: ${c.band}`);
  }
});

// ── 5. il profilo sposta, ma non stravolge ──────────────────────────────────

test('il profilo creativo alza il contratto di cessione, non gli altri', async () => {
  const withIp = { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false, profile: { money: true, ip: true, freelance: true } };
  const withoutIp = { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false, profile: { money: true } };

  const run = async (id, settings) => {
    const c = CORPUS.find((x) => x.id === id);
    const v = await analyze({
      text: c.text,
      ctx: { url: 'https://x.test', pricing: c.pricing || {}, terms: {}, form: {} },
      actionType: c.actionType,
      settings,
      now: T0,
    });
    return v.score;
  };

  const assignmentWithIp = await run('freelance_assignment', withIp);
  const assignmentWithoutIp = await run('freelance_assignment', withoutIp);
  assert.ok(assignmentWithIp > assignmentWithoutIp, 'la cessione dei diritti deve pesare di più per chi vive del proprio lavoro');

  // Su un contratto che non tocca i contenuti, il profilo creativo non deve
  // spostare quasi nulla: se lo facesse, non starebbe personalizzando.
  const telcoWithIp = await run('telco_24m', withIp);
  const telcoWithoutIp = await run('telco_24m', withoutIp);
  assert.ok(Math.abs(telcoWithIp - telcoWithoutIp) <= 2, `il profilo IP sposta la telco di ${Math.abs(telcoWithIp - telcoWithoutIp)} punti`);
});

// ── le fasce alte devono essere raggiungibili anche senza prezzo ────────────

test('un contratto grave senza prezzo può arrivare a HIGH RISK', async () => {
  // Il tetto delle sole clausole era 75, con HIGH RISK a 76: per un utente
  // fuori dall'UE — che non riceve il contributo del motore consumer — le due
  // fasce alte erano *strutturalmente* irraggiungibili senza un prezzo
  // estraibile. Una cessione totale dei diritti d'autore usciva COMMITMENT.
  const c = CORPUS.find((x) => x.id === 'freelance_assignment');
  for (const jurisdiction of ['IT', 'US']) {
    const verdict = await analyze({
      text: c.text,
      ctx: { url: 'https://x.test', title: c.label, pricing: {}, terms: {}, form: {} },
      actionType: c.actionType,
      settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false, jurisdiction, profile: c.profile },
      now: T0,
    });
    assert.ok(verdict.cost?.worstCase == null, 'questo caso deve restare senza prezzo');
    assert.ok(
      BAND_ORDER.indexOf(verdict.level.id) >= BAND_ORDER.indexOf('high_risk'),
      `con giurisdizione ${jurisdiction} esce ${verdict.level.id} (${verdict.score})`
    );
  }
});

test('il residuo distingue fra due clausole e sette', () => {
  const severe = { severity: 85 };
  const media = { severity: 45 };
  const due = aggregateSeverity([severe, media]);
  const four = aggregateSeverity([severe, media, media, media]);
  assert.ok(four > due, `quattro clausole (${four}) non pesano più di due (${due})`);
});

test('la pressione economica distingue ancora sopra i 15.000 €', () => {
  assert.ok(
    moneyPressure(200_000) > moneyPressure(15_000),
    'un mutuo da 200.000 € pesa quanto un finanziamento da 15.000 €'
  );
});

test('il profilo predefinito non declassa la cessione dei diritti', () => {
  // «l'utente non ha attivato l'area» non è «all'utente non interessa»: il
  // profilo predefinito non contiene `ip`, e la categoria più grave del
  // dizionario veniva attenuata del 15% per quasi tutte le installazioni.
  const { multiplier } = multiplierFor('ip_assignment', DEFAULT_SETTINGS.profile);
  assert.ok(multiplier >= 1, `moltiplicatore ${multiplier} sul profilo predefinito`);
});

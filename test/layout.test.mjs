/**
 * Impaginazione: le stesse condizioni, tre forme di pagina.
 *
 * I nove testi del corpus sono tutti prosa in paragrafi, e questo nascondeva
 * un'intera classe di errore: innerText mette ogni voce di elenco e ogni cella
 * di tabella su una riga a sé, e le righe sotto i 40 caratteri venivano
 * scartate da splitClauses prima ancora di arrivare alle regole. Su un
 * riepilogo d'offerta — la forma in cui un checkout mostra le condizioni — il
 * motore restituiva zero finding.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyzer.js';
import { runRules } from '../src/core/rules.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { LAYOUTS, LAYOUT_CORE_CATEGORIES, LAYOUT_PRICING } from './fixtures/corpus.mjs';

const T0 = new Date('2026-08-15T10:00:00Z').getTime();

const scored = new Map();
for (const l of LAYOUTS) {
  const verdict = await analyze({
    text: l.text,
    ctx: { url: 'https://telco.test', title: l.layout, pricing: LAYOUT_PRICING, terms: {}, form: {} },
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false },
    now: T0,
  });
  scored.set(l.id, { ...l, verdict });
}

const categories = (id) => new Set(scored.get(id).verdict.findings.map((f) => f.category));

// ── la regressione che ha motivato tutto ────────────────────────────────────

test('un riepilogo in elenco puntato non è invisibile al motore', () => {
  const findings = runRules(LAYOUTS.find((l) => l.id === 'telco_elenco').text).findings;
  assert.ok(
    findings.length >= 4,
    `su un elenco puntato il motore trova solo ${findings.length} condizioni`
  );
});

test('un riepilogo in tabella non è invisibile al motore', () => {
  const findings = runRules(LAYOUTS.find((l) => l.id === 'telco_tabella').text).findings;
  assert.ok(
    findings.length >= 3,
    `su una tabella il motore trova solo ${findings.length} condizioni`
  );
});

// ── equivalenza fra impaginazioni ───────────────────────────────────────────

test('le stesse condizioni danno la stessa fascia comunque siano impaginate', () => {
  const bands = LAYOUTS.map((l) => scored.get(l.id).verdict.level.id);
  assert.equal(
    new Set(bands).size,
    1,
    `fasce diverse per lo stesso contratto: ${LAYOUTS.map((l, i) => `${l.layout}=${bands[i]}`).join(', ')}`
  );
});

test('le condizioni economiche portanti emergono da ogni impaginazione', () => {
  for (const l of LAYOUTS) {
    const found = categories(l.id);
    for (const cat of LAYOUT_CORE_CATEGORIES) {
      assert.ok(found.has(cat), `${l.layout}: manca ${cat}`);
    }
  }
});

test('la penale entra nel costo da ogni impaginazione', () => {
  for (const l of LAYOUTS) {
    const cost = scored.get(l.id).verdict.cost;
    assert.ok(
      (cost?.lines || []).some((x) => /penale/i.test(x.label)),
      `${l.layout}: la penale di 120 € non compare nella formula`
    );
    assert.ok(cost.worstCase > 800, `${l.layout}: worstCase ${cost.worstCase}, atteso oltre 800 €`);
  }
});

// ── importi scritti a parole ────────────────────────────────────────────────

test('«120,00 euro» vale quanto «€ 120,00»', () => {
  const words = scored.get('telco_elenco').verdict.cost.worstCase;
  const symbols = scored.get('telco_tabella').verdict.cost.worstCase;
  assert.equal(words, symbols, `la valuta cambia il totale: ${words} vs ${symbols}`);
});

test('le tre impaginazioni danno lo stesso identico totale', () => {
  const totals = LAYOUTS.map((l) => scored.get(l.id).verdict.cost.worstCase);
  assert.equal(new Set(totals).size, 1, `totali diversi: ${totals.join(' vs ')}`);
});

// ── ricomposizione delle righe spezzate ────────────────────────────────────

test('il testo con a capo fissi non perde le clausole spezzate a metà frase', () => {
  assert.ok(
    categories('telco_prosa').has('no_refund'),
    'in prosa «Gli importi versati non sono | rimborsabili» è spezzato dall’a capo e la regola non aggancia'
  );
});

test('una causale in cella di tabella vale quanto una in prosa', () => {
  const cost = scored.get('telco_tabella').verdict.cost;
  assert.ok(
    (cost.lines || []).some((x) => /attivazione/i.test(x.label)),
    '«Attivazione 49,00 €» in tabella non aggancia: la cue pretende «spese di attivazione»'
  );
});

/**
 * Test del motore. Girano in Node senza browser: i moduli core non toccano
 * chrome.* né il DOM proprio per restare verificabili.
 *
 *   node --test test/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, extractPrices, extractDurations, splitClauses, htmlToText, hashText } from '../src/core/text.js';
import { runRules } from '../src/core/rules.js';
import { computeCost, buildTimeline, extractMinimumTerm, extractPenalty, extractNoticePeriod } from '../src/core/consequence.js';
import { personalize, multiplierFor } from '../src/core/profile.js';
import { computeScore, aggregateSeverity, moneyPressure, shouldBlock } from '../src/core/scoring.js';
import { runConsumerChecks } from '../src/core/eu.js';
import { analyze, mergeFindings } from '../src/core/analyzer.js';
import { parseJSON, validate } from '../src/core/llm.js';
import { levelForScore, DEFAULT_SETTINGS } from '../src/core/constants.js';
import { isAllowed } from '../src/core/sender.js';

// Contratto di prova: è l'esempio della riflessione di partenza.
const CONTRACT = `
CONDIZIONI GENERALI DI ABBONAMENTO

1. Corrispettivo. Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.

2. Durata. Il contratto ha una durata minima di 12 mesi a decorrere dalla data di attivazione.

3. Rinnovo. Alla scadenza il contratto si rinnova automaticamente per un uguale periodo, salvo disdetta
da comunicarsi con preavviso di almeno 30 giorni mediante raccomandata.

4. Recesso anticipato. In caso di recesso prima della scadenza è dovuta una penale pari a € 79,00.

5. Rimborsi. Gli importi versati non sono rimborsabili in alcun caso.

6. Modifiche. Il fornitore si riserva il diritto di modificare unilateralmente le presenti condizioni e il
prezzo del servizio, dandone comunicazione sul proprio sito.

7. Contenuti. L'utente concede al fornitore una licenza mondiale, gratuita, perpetua e irrevocabile di usare,
riprodurre e modificare i contenuti caricati, anche per l'addestramento di modelli di intelligenza artificiale.

8. Dati. I dati potranno essere condivisi con terze parti a fini di profilazione e pubblicità personalizzata.

9. Controversie. Ogni controversia sarà devoluta ad arbitrato rituale. Il foro competente esclusivo è quello di Dublino.

10. Responsabilità. Il fornitore non sarà in alcun modo responsabile per danni derivanti dall'uso del servizio.
`;

const CTX_SUBSCRIPTION = {
  url: 'https://esempio.test/checkout',
  title: 'Attiva il tuo piano',
  buttonText: 'Conferma abbonamento',
  pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true },
  form: { isCheckout: true, precheckedConsents: 0, consentBoxes: 1 },
  terms: { found: true, textInPage: true },
};

// ── text ────────────────────────────────────────────────────────────────────

test('parseAmount interpreta i formati italiano e inglese', () => {
  assert.equal(parseAmount('19,99'), 19.99);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234'), 1234);
  assert.equal(parseAmount('49'), 49);
  assert.equal(parseAmount('abc'), null);
});

test('extractPrices trova importo, valuta e ricorrenza', () => {
  const prices = extractPrices('Il canone è di € 19,99 al mese, con attivazione di 49,00 EUR una tantum.');
  assert.equal(prices.length, 2);
  assert.equal(prices[0].amount, 19.99);
  assert.equal(prices[0].currency, 'EUR');
  assert.equal(prices[0].period, 'month');
  assert.equal(prices[1].amount, 49);
  assert.equal(prices[1].period, null);
});

test('extractPrices legge anche il formato anglosassone', () => {
  const prices = extractPrices('Only $9.99/mo after the trial, plus a $1,200.00 setup fee.');
  assert.equal(prices[0].amount, 9.99);
  assert.equal(prices[0].currency, 'USD');
  assert.equal(prices[0].period, 'month');
  assert.equal(prices[1].amount, 1200);
});

test('extractDurations normalizza le durate in mesi', () => {
  const d = extractDurations('durata minima di 2 anni, preavviso di 30 giorni');
  assert.equal(d[0].months, 24);
  assert.ok(Math.abs(d[1].months - 1) < 0.01);
});

test('htmlToText rimuove script e tag e decodifica le entità', () => {
  const text = htmlToText('<div><script>alert(1)</script><p>Prezzo &euro;19,99 &amp; oltre</p></div>');
  assert.ok(!text.includes('alert'));
  assert.ok(text.includes('€19,99 & oltre'));
});

test('splitClauses non perde clausole numerate', () => {
  const clauses = splitClauses(CONTRACT);
  assert.ok(clauses.length >= 9, `attese almeno 9 clausole, trovate ${clauses.length}`);
});

test('hashText è stabile e discrimina', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
});

// ── regole ──────────────────────────────────────────────────────────────────

test('il motore a regole riconosce le clausole del contratto di prova', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const cats = findings.map((f) => f.category);
  for (const expected of [
    'auto_renewal', 'minimum_term', 'early_termination_penalty', 'notice_period',
    'no_refund', 'unilateral_change', 'ip_license', 'ai_training',
    'data_sharing', 'profiling', 'arbitration', 'jurisdiction', 'liability_limitation',
  ]) {
    assert.ok(cats.includes(expected), `categoria mancante: ${expected}`);
  }
});

test('ogni finding porta con sé la citazione testuale', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  for (const f of findings) {
    assert.ok(f.quote && f.quote.length > 10, `citazione mancante per ${f.category}`);
  }
});

test('le formule di negazione non generano falsi positivi', () => {
  const sample = 'Nessun rinnovo automatico: puoi disdire in qualsiasi momento senza penali. Non vendiamo i tuoi dati.';
  const { findings } = runRules(sample, {});
  assert.equal(findings.length, 0, `falsi positivi: ${findings.map((f) => f.category).join(', ')}`);
});

test('un testo innocuo non produce segnalazioni', () => {
  const sample = 'Benvenuto nella nostra newsletter settimanale. Ogni martedì ricevi tre articoli scelti dalla redazione. Puoi annullare l’iscrizione dal link in fondo a ogni messaggio.';
  const { findings } = runRules(sample, {});
  assert.equal(findings.length, 0);
});

test('i dark pattern arrivano dal contesto, non dal testo', () => {
  const { findings } = runRules('Testo neutro senza clausole particolari da segnalare in alcun modo.', {
    form: { precheckedConsents: 2 },
    pricing: { trial: { raw: '30 giorni', months: 1 }, recurring: true },
  });
  const dp = findings.find((f) => f.category === 'dark_pattern');
  assert.ok(dp, 'dark pattern non rilevato');
  assert.equal(dp.details.length, 2);
});

// ── conseguenze ─────────────────────────────────────────────────────────────

test('estrae durata minima, preavviso e penale dai punti giusti', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  assert.equal(extractMinimumTerm(CONTRACT, findings).months, 12);
  assert.equal(Math.round(extractNoticePeriod(CONTRACT, findings).months * 30), 30);
  assert.equal(extractPenalty(CONTRACT, findings).amount, 79);
});

test('il costo worst-case somma canone, penale e costi una tantum', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const cost = computeCost({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, findings });
  // 19,99 × 12 = 239,88  +  79 penale  +  49 attivazione  =  367,88
  assert.equal(cost.worstCase, 367.88);
  assert.equal(cost.horizonMonths, 12);
  assert.ok(cost.understated, 'il prezzo mostrato sottostima nettamente l’impegno');
});

test('senza durata minima ma con rinnovo automatico si assume un anno', () => {
  const sample = 'Il servizio costa 10 euro al mese e si rinnova automaticamente salvo disdetta.';
  const ctx = { pricing: { amount: 10, currency: 'EUR', period: 'month', recurring: true } };
  const { findings } = runRules(sample, ctx);
  const cost = computeCost({ text: sample, ctx, findings });
  assert.equal(cost.horizonMonths, 12);
  assert.equal(cost.worstCase, 120);
});

test('la timeline mette la scadenza di disdetta prima del rinnovo', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const cost = computeCost({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, findings });
  const now = new Date('2026-08-15T10:00:00Z').getTime();
  const timeline = buildTimeline({ ctx: CTX_SUBSCRIPTION, cost, findings, actionType: 'subscribe', now });

  const deadline = timeline.find((s) => s.kind === 'deadline');
  const renewal = timeline.find((s) => s.kind === 'renewal');
  assert.ok(deadline, 'manca la scadenza di disdetta');
  assert.ok(renewal, 'manca il rinnovo');
  assert.ok(new Date(deadline.at) < new Date(renewal.at));
  // 12 mesi meno 30 giorni di preavviso → metà luglio 2027
  assert.match(deadline.when, /luglio 2027/);
});

// ── profilo personale ───────────────────────────────────────────────────────

test('il profilo cambia la severità della stessa clausola', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const base = findings.find((f) => f.category === 'ip_license').severity;

  const ordinaryUser = personalize(findings, { money: true, privacy: true }).find((f) => f.category === 'ip_license');
  const photographer = personalize(findings, { money: true, privacy: true, ip: true, freelance: true }).find((f) => f.category === 'ip_license');

  assert.ok(photographer.severity > ordinaryUser.severity, 'il fotografo deve vedere un rischio maggiore');
  assert.ok(photographer.severity > base);
  assert.deepEqual(photographer.personalReasons, ['Proprietà intellettuale', 'Lavoro freelance / professionale']);
});

test('il moltiplicatore è limitato e con rendimento decrescente', () => {
  const all = multiplierFor('ai_training', { ip: true, privacy: true, freelance: true, business: true });
  assert.ok(all.multiplier <= 1.9);
  assert.ok(all.multiplier > 1.45);
});

// ── punteggio ───────────────────────────────────────────────────────────────

test('aggregateSeverity fa dominare il rischio più grave', () => {
  const one = aggregateSeverity([{ severity: 80 }]);
  const ten = aggregateSeverity(Array.from({ length: 10 }, () => ({ severity: 30 })));
  assert.ok(one > ten, 'un rischio grave deve pesare più di dieci tiepidi');
});

test('la pressione economica cresce in modo logaritmico e limitato', () => {
  // Asserzioni sul *comportamento*, non sui numeri: il tetto è un parametro di
  // calibrazione e cambierà ancora. Che sia monotona e limitata, no.
  assert.equal(moneyPressure(0), 0);
  assert.equal(moneyPressure(-5), 0);
  let previous = -1;
  for (const amount of [10, 50, 200, 900, 5000, 20000, 500000]) {
    const v = moneyPressure(amount);
    assert.ok(v >= previous, `non monotona in ${amount}`);
    assert.ok(v < 50, `contributo sproporzionato per ${amount} €: ${v}`);
    previous = v;
  }
  // La crescita deve rallentare: raddoppiare l'importo non raddoppia il peso.
  const d1 = moneyPressure(200) - moneyPressure(100);
  const d2 = moneyPressure(20000) - moneyPressure(10000);
  assert.ok(Math.abs(d1 - d2) <= 2, 'la scala non è logaritmica');
});

test('i livelli coprono la scala senza buchi e in ordine', () => {
  // Le soglie vengono dalla calibrazione (test/calibration.test.mjs) e si
  // sposteranno ancora: qui si verifica solo che la scala resti continua,
  // monotona e completa.
  const order = ['safe', 'review', 'commitment', 'high_risk', 'critical'];
  assert.equal(levelForScore(0).id, 'safe');
  assert.equal(levelForScore(100).id, 'critical');

  let last = 0;
  const seen = new Set();
  for (let score = 0; score <= 100; score++) {
    const idx = order.indexOf(levelForScore(score).id);
    assert.ok(idx >= 0, `livello sconosciuto per ${score}`);
    assert.ok(idx >= last, `il livello scende passando da ${score - 1} a ${score}`);
    last = idx;
    seen.add(idx);
  }
  assert.equal(seen.size, order.length, 'qualche livello è irraggiungibile');
});

test('shouldBlock rispetta la soglia scelta dall’utente', () => {
  assert.equal(shouldBlock('review', 'commitment'), false);
  assert.equal(shouldBlock('commitment', 'commitment'), true);
  assert.equal(shouldBlock('critical', 'high_risk'), true);
  assert.equal(shouldBlock('high_risk', 'critical'), false);
});

test('un solo indizio debole non fa scattare l’allarme rosso', () => {
  const { score, level } = computeScore({
    findings: [{ severity: 60, confidence: 0.6, category: 'jurisdiction' }],
    cost: {},
    consumer: {},
    actionType: 'accept_terms',
  });
  assert.ok(score <= 44, `punteggio troppo alto: ${score}`);
  assert.notEqual(level.id, 'critical');
});

// ── motore consumer UE/IT ───────────────────────────────────────────────────

test('il motore italiano segnala arbitrato, foro e modifiche unilaterali', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const cost = computeCost({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, findings });
  const consumer = runConsumerChecks({ text: CONTRACT, findings, ctx: CTX_SUBSCRIPTION, cost, actionType: 'subscribe', jurisdiction: 'IT' });

  const ids = consumer.flags.map((f) => f.id);
  assert.ok(ids.includes('eu.arbitration'));
  assert.ok(ids.includes('eu.jurisdiction'));
  assert.ok(ids.includes('eu.unilateral'));
  assert.ok(ids.includes('eu.withdrawal'), 'manca il diritto di recesso non menzionato');
  // Il tetto è 25: sopra, il motore consumer smetterebbe di essere un
  // contributo e diventerebbe il punteggio. Sotto 25 — era 15 — tre
  // segnalazioni bastavano a saturarlo, e un e-commerce con tre flag pesava
  // quanto un finanziamento con sei.
  assert.ok(consumer.boost > 0 && consumer.boost <= 25, 'il contributo va smorzato');
  assert.ok(consumer.disclaimer.length > 0);
});

test('fuori da UE/IT il motore consumer non si attiva', () => {
  const { findings } = runRules(CONTRACT, CTX_SUBSCRIPTION);
  const consumer = runConsumerChecks({ text: CONTRACT, findings, jurisdiction: 'US' });
  assert.equal(consumer.applicable, false);
  assert.equal(consumer.boost, 0);
});

test('il consenso precompilato viene segnalato come non valido', () => {
  const ctx = { form: { precheckedConsents: 1 } };
  const findings = [{ category: 'profiling', severity: 40 }];
  const consumer = runConsumerChecks({ text: 'profilazione', findings, ctx, jurisdiction: 'IT' });
  assert.ok(consumer.flags.some((f) => f.id === 'eu.consent_bundled'));
});

// ── merge regole + LLM ──────────────────────────────────────────────────────

test('mergeFindings unisce le due sorgenti e alza la fiducia sulle conferme', () => {
  const rules = [{ category: 'auto_renewal', label: 'Rinnovo automatico', severity: 55, confidence: 1, quote: 'si rinnova automaticamente', why: 'x' }];
  const llm = [{ category: 'auto_renewal', label: 'Rinnovo automatico', title: 'Rinnovo tacito annuale', severity: 70, quote: 'il contratto si rinnova automaticamente per un uguale periodo', plain: 'ti impegni per un altro anno', certainty: 'explicit', why: 'x' },
               { category: 'data_sale', label: 'Vendita dei dati', title: 'Vendita dei dati', severity: 80, quote: 'q', plain: 'p', certainty: 'explicit', why: 'y' }];

  const merged = mergeFindings(rules, llm);
  assert.equal(merged.length, 2);
  const renewal = merged.find((f) => f.category === 'auto_renewal');
  assert.equal(renewal.source, 'both');
  assert.ok(renewal.severity >= 70);
  assert.equal(renewal.title, 'Rinnovo tacito annuale');
});

// ── parsing della risposta LLM ──────────────────────────────────────────────

test('parseJSON recupera il JSON anche dentro un blocco markdown', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Ecco il risultato: {"a":2} — spero sia utile'), { a: 2 });
});

test('validate scarta categorie inventate e normalizza i numeri', () => {
  const out = validate({
    headline: 'x',
    clauses: [
      { category: 'categoria_inesistente', severity: 90 },
      { category: 'auto_renewal', severity: '70', quote: 'q', plain: 'p', certainty: 'explicit' },
    ],
    economics: { recurringAmount: '19,99', period: 'month', worstCaseTotal: 239.88 },
    confidence: 1.4,
  });
  assert.equal(out.clauses.length, 1);
  assert.equal(out.clauses[0].severity, 70);
  assert.equal(out.economics.recurringAmount, 19.99);
  assert.equal(out.confidence, 1);
});

// ── pipeline completa ───────────────────────────────────────────────────────

test('analisi end-to-end senza LLM: numeri, livello e scadenza', async () => {
  const settings = { ...DEFAULT_SETTINGS, useLLM: false, jurisdiction: 'IT', profile: { money: true, privacy: true, identity: true } };
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX_SUBSCRIPTION,
    actionType: 'subscribe',
    settings,
    now: new Date('2026-08-15T10:00:00Z').getTime(),
  });

  assert.equal(v.cost.worstCase, 367.88);
  assert.ok(['high_risk', 'critical'].includes(v.level.id), `livello inatteso: ${v.level.id}`);
  assert.ok(v.mustRemember, 'deve indicare cosa segnare in calendario');
  assert.match(v.mustRemember, /luglio 2027/);
  assert.ok(v.headline.includes('367'), `headline poco concreta: ${v.headline}`);
  assert.ok(v.consumer.flags.length >= 3);
  assert.equal(v.engine.llm, false);
  assert.ok(v.drivers.length > 0);
});

test('lo stesso contratto pesa di più per un freelance creativo', async () => {
  const base = { ...DEFAULT_SETTINGS, useLLM: false };
  const plain = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: { ...base, profile: { money: true } } });
  const creative = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: { ...base, profile: { money: true, ip: true, freelance: true } } });
  assert.ok(creative.score >= plain.score, 'il profilo creativo non deve abbassare il rischio');
  const ip = creative.findings.find((f) => f.category === 'ip_license');
  assert.ok(ip.personalized);
});

test('una pagina innocua resta verde e non blocca', async () => {
  const settings = { ...DEFAULT_SETTINGS, useLLM: false };
  const v = await analyze({
    text: 'Iscriviti alla newsletter per ricevere tre articoli a settimana. Puoi annullare l’iscrizione quando vuoi dal link in fondo alla email. Non condividiamo il tuo indirizzo con nessuno.',
    ctx: { url: 'https://blog.test', pricing: {}, form: {}, terms: {} },
    actionType: 'signup',
    settings,
  });
  assert.equal(v.level.id, 'safe');
  assert.equal(shouldBlock(v.level.id, settings.blockFrom), false);
});

test('l’analisi resta utile anche quando l’LLM fallisce', async () => {
  const settings = { ...DEFAULT_SETTINGS, useLLM: true, remoteConsentAt: '2026-01-01T00:00:00.000Z', provider: 'anthropic', apiKey: 'chiave-finta', llmThreshold: 0 };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 });
  try {
    const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings });
    assert.equal(v.engine.llm, false);
    assert.ok(v.engine.llmError.message.includes('non valida'));
    assert.ok(v.findings.length > 5, 'il motore locale deve comunque produrre il verdetto');
    assert.equal(v.cost.worstCase, 367.88);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('con l’LLM disponibile i numeri più prudenti prevalgono', async () => {
  const settings = { ...DEFAULT_SETTINGS, useLLM: true, remoteConsentAt: '2026-01-01T00:00:00.000Z', provider: 'openai', apiKey: 'k', llmThreshold: 0, model: 'test' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: 'Stai per impegnarti per 24 mesi',
                summary: 'riassunto',
                clauses: [{ category: 'auto_renewal', severity: 75, title: 'Rinnovo tacito', quote: 'si rinnova automaticamente', plain: 'ti riagganci per un anno', certainty: 'explicit' }],
                economics: { recurringAmount: 19.99, currency: 'EUR', period: 'month', minimumTermMonths: 24, penaltyAmount: 79, worstCaseTotal: 900, worstCaseExplanation: '19,99 x 24 + 79 + 49' },
                consequences: ['parte l’abbonamento'],
                mustRemember: 'Disdici entro giugno 2028',
                confidence: 0.9,
              }),
            },
          },
        ],
      }),
      { status: 200 }
    );
  try {
    const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings });
    assert.equal(v.engine.llm, true);
    assert.equal(v.headline, 'Stai per impegnarti per 24 mesi');
    assert.equal(v.cost.horizonMonths, 24, 'deve prevalere la durata più lunga');
    assert.ok(v.cost.worstCase >= 900, `worst case troppo basso: ${v.cost.worstCase}`);
    assert.equal(v.mustRemember, 'Disdici entro giugno 2028');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── regressioni ─────────────────────────────────────────────────────────────

test('regressione: la durata minima si legge anche in un contratto scritto di seguito', () => {
  // Un solo blocco di testo, senza clausole numerate: è il caso di un contratto
  // incollato dal pannello laterale. La "disdetta" della frase successiva non
  // deve far scartare la durata minima.
  const sample =
    'CONDIZIONI GENERALI. Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00. ' +
    'Il contratto ha una durata minima di 24 mesi. Alla scadenza si rinnova automaticamente per un uguale periodo ' +
    'salvo disdetta con preavviso di almeno 60 giorni. In caso di recesso anticipato è dovuta una penale pari a € 120,00.';
  const ctx = { pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true } };
  const { findings } = runRules(sample, ctx);
  const cost = computeCost({ text: sample, ctx, findings });

  assert.equal(cost.minTerm.months, 24, 'la durata minima deve essere 24 mesi, non il preavviso');
  assert.equal(Math.round(cost.notice.months * 30), 60);
  // 19,99 × 24 = 479,76  +  120 penale  +  49 attivazione  =  648,76
  assert.equal(cost.worstCase, 648.76);
});

test('regressione: una penale non viene scambiata per il prezzo del servizio', () => {
  // Il motore locale non deve dedurre un prezzo dal nulla: se la pagina non
  // fornisce un importo ricorrente, il costo si basa solo su ciò che è certo.
  const sample = 'In caso di recesso anticipato è dovuta una penale pari a € 120,00. Spese di attivazione € 49,00.';
  const { findings } = runRules(sample, {});
  const cost = computeCost({ text: sample, ctx: { pricing: {} }, findings });
  assert.equal(cost.displayed, null);
  assert.equal(cost.worstCase, 169);
  assert.ok(cost.lines.every((l) => l.kind !== 'recurring'));
});

test('regressione: gli avverbi fra verbo e complemento non fanno perdere la clausola', () => {
  // "modificare unilateralmente il prezzo" è la formulazione più comune nei
  // contratti reali, e sfuggiva a una regola che pretendeva i due termini adiacenti.
  const cases = [
    ['Il fornitore può modificare unilateralmente il prezzo del servizio.', 'price_change'],
    ['Il fornitore potrà in qualsiasi momento variare le tariffe applicate.', 'price_change'],
    ['Il fornitore si riserva il diritto di modificare in ogni momento le condizioni.', 'unilateral_change'],
    ['Il gestore può modificare a propria discrezione i presenti termini.', 'unilateral_change'],
  ];
  for (const [phrase, category] of cases) {
    const sample = `Premessa di contorno sufficientemente lunga da superare la soglia minima di analisi. ${phrase}`;
    const { findings } = runRules(sample, {});
    assert.ok(
      findings.some((f) => f.category === category),
      `non riconosciuta (${category}): "${phrase}"`
    );
  }
});

// ── importi scritti a parole ────────────────────────────────────────────────

test('«120,00 euro» è un importo quanto «€ 120,00»', () => {
  const cases = [
    ['penale pari a 120,00 euro', 120],
    ['spese di attivazione di 49,00 EURO', 49],
    ['un canone di 1.299,00 euro + IVA', 1299],
    ['costo di 120 Euro', 120],
    ['una penale di € 120,00', 120],
  ];
  for (const [phrase, wanted] of cases) {
    const priceList = extractPrices(phrase);
    assert.equal(priceList.length, 1, `"${phrase}" → ${priceList.length} importi`);
    assert.equal(priceList[0].amount, wanted, `"${phrase}"`);
    assert.equal(priceList[0].currency, 'EUR', `"${phrase}"`);
  }
});

test('la valuta a parole non raddoppia il conteggio del simbolo', () => {
  assert.equal(extractPrices('il canone è di € 19,99 al mese').length, 1);
});

test('la penale scritta a parole entra nel costo', () => {
  const sample = `Il contratto ha una durata minima di 24 mesi e si rinnova automaticamente.
In caso di recesso anticipato è dovuta una penale pari a 120,00 euro.`;
  const { findings } = runRules(sample, {});
  const cost = computeCost({
    text: sample,
    ctx: { pricing: { amount: 29.9, currency: 'EUR', period: 'month', recurring: true } },
    findings,
  });
  assert.ok(
    (cost.lines || []).some((l) => /penale/i.test(l.label)),
    'la penale non compare fra le righe della formula'
  );
  assert.ok(cost.worstCase >= 120, `worstCase ${cost.worstCase}, dovrebbe includere i 120 €`);
});

// ── righe corte: elenchi e tabelle ──────────────────────────────────────────

test('le righe corte consecutive diventano una clausola sola', () => {
  const list = 'Condizioni:\n• Rinnovo automatico\n• Durata minima 24 mesi\n• Penale 120,00 euro';
  const clauseList = splitClauses(list);
  assert.equal(clauseList.length, 1, 'le voci di elenco non sono state accorpate');
  assert.match(clauseList[0].text, /Rinnovo automatico.*Durata minima.*Penale/s);
});

test('un paragrafo vero non viene fuso con quello dopo', () => {
  const sample = [
    'Il servizio è offerto in abbonamento mensile e comprende assistenza via email.',
    'Il fornitore può sospendere il servizio per manutenzione programmata, dandone avviso.',
  ].join('\n');
  assert.equal(splitClauses(sample).length, 2);
});

test('l’accorpamento non supera il limite di lunghezza di una clausola', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `Voce numero ${i}`).join('\n');
  for (const c of splitClauses(lines)) {
    assert.ok(c.text.length <= 900, `clausola da ${c.text.length} caratteri`);
  }
});

// ── negazione ───────────────────────────────────────────────────────────────

test('una clausola favorevole non viene segnalata come rischio', () => {
  const cases = [
    'Il recesso non comporta alcuna penale né costi aggiuntivi di sorta.',
    'È esclusa qualsiasi penale in caso di recesso anticipato del contratto.',
    'Non è previsto il rinnovo tacito del contratto alla sua naturale scadenza.',
    'I tuoi dati non vengono condivisi con terze parti per alcuna finalità.',
    'I contenuti non vengono utilizzati per addestrare modelli di intelligenza artificiale.',
    'Non effettuiamo alcuna profilazione dei tuoi comportamenti di navigazione.',
    'Puoi disdire in qualsiasi momento senza penali né costi aggiuntivi di alcun tipo.',
    'Il foro competente è quello del consumatore, ai sensi del Codice del Consumo.',
  ];
  for (const phrase of cases) {
    const { findings } = runRules(phrase, {});
    assert.equal(
      findings.length, 0,
      `segnalata come rischio: "${phrase}" → ${findings.map((f) => f.category).join(', ')}`
    );
  }
});

test('una negazione non spegne le clausole delle frasi successive', () => {
  const sample =
    'Non vendiamo i tuoi dati. Li condividiamo però con partner pubblicitari a fini di ' +
    'profilazione e li conserviamo a tempo indeterminato. Il contratto si rinnova ' +
    'automaticamente e prevede una penale di recesso di 200 euro.';
  const categories = runRules(sample, {}).findings.map((f) => f.category);
  for (const wanted of ['auto_renewal', 'early_termination_penalty', 'profiling']) {
    assert.ok(categories.includes(wanted), `spenta dalla prima frase: ${wanted}`);
  }
});

test('la negazione non tracima oltre ciò che nega davvero', () => {
  const cases = [
    // «senza preavviso» non nega la penale che segue
    ['Il fornitore può recedere senza preavviso; in tal caso è comunque dovuta una penale pari a 150,00 euro.', 'early_termination_penalty'],
    // «alcuni» al plurale è affermativo, «alcuno» al singolare è negativo
    ['Alcuni servizi in abbonamento prevedono una penale di recesso anticipato.', 'early_termination_penalty'],
    // «non può» non è una negazione della clausola
    ['Il cliente non può recedere prima della scadenza, pena una penale di 300,00 euro.', 'early_termination_penalty'],
  ];
  for (const [phrase, wanted] of cases) {
    const categories = runRules(phrase, {}).findings.map((f) => f.category);
    assert.ok(categories.includes(wanted), `persa: "${phrase}"`);
  }
});

// ── durate e periodicità ────────────────────────────────────────────────────

test('le durate si leggono anche quando non sono cifre', () => {
  const cases = [
    ['durata minima di ventiquattro mesi', 24],
    ['durata minima di 24 (ventiquattro) mesi', 24],
    ['la durata minima è di un anno', 12],
    ['il contratto ha durata biennale', 24],
    ['Durata minima: 18 mensilità', 18],
    ['preavviso di tre mesi', 3],
    ['Preavviso di 90 gg', 3],
    ['Minimum term of twelve months', 12],
  ];
  for (const [phrase, months] of cases) {
    const d = extractDurations(phrase)[0];
    assert.ok(d, `nessuna durata in "${phrase}"`);
    assert.equal(Math.round(d.months), months, `"${phrase}"`);
  }
});

test('un vincolo di 24 mesi non viene stimato come 12', () => {
  const sample = 'Il contratto prevede una durata minima di ventiquattro mesi con rinnovo automatico.';
  const { findings } = runRules(sample, {});
  const cost = computeCost({
    text: sample,
    ctx: { pricing: { amount: 10, currency: 'EUR', period: 'month', recurring: true } },
    findings,
  });
  assert.equal(cost.horizonMonths, 24, `orizzonte ${cost.horizonMonths} mesi`);
  assert.equal(cost.worstCase, 240);
});

test('le periodicità non standard hanno un valore in mesi', () => {
  const cases = [
    ['19,99 € ogni tre mesi', 'quarter'],
    ['19,99 € bimestrale', 'bimonth'],
    ['19,99 € semestrale', 'semester'],
    ['19,99 € ogni 28 giorni', 'fourweeks'],
  ];
  for (const [phrase, periodo] of cases) {
    assert.equal(extractPrices(phrase)[0].period, periodo, `"${phrase}"`);
  }
});

test('una spesa per ogni rata viene moltiplicata per i cicli', () => {
  const sample = 'Il contratto ha una durata minima di ventiquattro mesi. Sono dovute spese di incasso di 2,00 euro per ogni rata.';
  const { findings } = runRules(sample, {});
  const cost = computeCost({
    text: sample,
    ctx: { pricing: { amount: 10, currency: 'EUR', period: 'month', recurring: true } },
    findings,
  });
  const collectionFee = (cost.lines || []).find((l) => /incasso/i.test(l.label));
  assert.ok(collectionFee, 'la spesa di incasso non compare');
  assert.equal(collectionFee.amount, 48, `contata ${collectionFee.amount} € invece di 2 € × 24`);
});

// ── regole troppo larghe ────────────────────────────────────────────────────

test('«penale» come aggettivo giuridico non è una penale di recesso', () => {
  const cases = [
    'Resta ferma la responsabilità penale dell’utente per eventuali illeciti commessi.',
    'I dati possono essere comunicati all’autorità giudiziaria in sede penale o civile.',
    'Ai sensi del codice penale, le dichiarazioni mendaci sono punite severamente.',
  ];
  for (const phrase of cases) {
    const categories = runRules(phrase, {}).findings.map((f) => f.category);
    assert.ok(
      !categories.includes('early_termination_penalty'),
      `scambiata per penale di recesso: "${phrase}"`
    );
  }
});

test('una penale economica viene comunque riconosciuta', () => {
  for (const phrase of [
    'In caso di recesso anticipato è dovuta una penale pari a 120,00 euro.',
    'È prevista una penalità per la risoluzione anticipata del contratto in essere.',
  ]) {
    const categories = runRules(phrase, {}).findings.map((f) => f.category);
    assert.ok(categories.includes('early_termination_penalty'), `persa: "${phrase}"`);
  }
});

test('un foro italiano non viene presentato come foro estero', () => {
  const cases = [
    'Il foro competente è determinato ai sensi di legge applicabile al rapporto.',
    'Il foro competente è quello previsto dalla normativa applicabile al consumatore.',
    'Le controversie sono devolute in via esclusiva al foro di Roma, Italia.',
  ];
  for (const phrase of cases) {
    const categories = runRules(phrase, { jurisdiction: 'IT' }).findings.map((f) => f.category);
    assert.ok(!categories.includes('jurisdiction'), `segnalato come estero: "${phrase}"`);
  }
});

test('un foro davvero estero viene segnalato', () => {
  for (const phrase of [
    'Ogni controversia sarà devoluta al foro esclusivo di Dublino, Irlanda.',
    'This agreement is governed by the laws of the State of Delaware.',
  ]) {
    const categories = runRules(phrase, { jurisdiction: 'IT' }).findings.map((f) => f.category);
    assert.ok(categories.includes('jurisdiction'), `non segnalato: "${phrase}"`);
  }
});

test('le formulazioni contrattuali reali agganciano', () => {
  const cases = [
    ['Il contratto prevede un vincolo di permanenza di 24 mesi dalla attivazione.', 'minimum_term'],
    ['È prevista una permanenza minima di 30 mesi presso il nostro servizio.', 'minimum_term'],
    ['Il contratto si intende tacitamente rinnovato per un uguale periodo di tempo.', 'auto_renewal'],
    ['L’utente concede alla Società una licenza non esclusiva sui contenuti caricati.', 'ip_license'],
    ['You grant the Company a worldwide, royalty-free license to your content.', 'ip_license'],
  ];
  for (const [phrase, category] of cases) {
    const categories = runRules(phrase, {}).findings.map((f) => f.category);
    assert.ok(categories.includes(category), `non riconosciuta (${category}): "${phrase}"`);
  }
});

// ── superficie esposta ai content script ────────────────────────────────────

const ID = 'abcdefghijklmnopqrstuvwxyzabcdef';
const BASE = `chrome-extension://${ID}/`;

test('una pagina web non può chiedere le impostazioni integrali', () => {
  const page = { id: ID, url: 'https://negozio.example/checkout', tab: { id: 7 } };
  for (const type of ['GET_SETTINGS', 'SET_SETTINGS', 'TEST_API_KEY']) {
    assert.equal(isAllowed(type, page, ID, BASE), false, `${type} consentito a una pagina web`);
  }
});

test('il pannello aperto come scheda resta autorizzato', () => {
  // La notifica di scadenza apre il pannello con chrome.tabs.create, quindi
  // `sender.tab` è definito: una guardia basata su quello lo bloccherebbe.
  const panel = { id: ID, url: `${BASE}src/sidepanel/sidepanel.html`, tab: { id: 9 } };
  const options = { id: ID, url: `${BASE}src/options/options.html` };
  for (const sender of [panel, options]) {
    assert.ok(isAllowed('GET_SETTINGS', sender, ID, BASE));
    assert.ok(isAllowed('SET_SETTINGS', sender, ID, BASE));
  }
});

test('i messaggi non privilegiati restano aperti a tutti', () => {
  const page = { id: ID, url: 'https://negozio.example/checkout', tab: { id: 7 } };
  for (const type of ['ANALYZE_ACTION', 'PREFETCH_ACTION', 'RECORD_DECISION', 'ALLOWLIST_ADD', 'GET_CONTENT_SETTINGS']) {
    assert.ok(isAllowed(type, page, ID, BASE), `${type} bloccato a un content script`);
  }
});

test('un’estensione diversa non passa la guardia', () => {
  const other = { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: `${BASE}src/options/options.html` };
  assert.equal(isAllowed('GET_SETTINGS', other, ID, BASE), false);
});

// ── spagnolo ────────────────────────────────────────────────────────────────

test('le clausole spagnole vengono riconosciute', () => {
  const cases = [
    ['El contrato tiene una permanencia mínima de veinticuatro meses desde el alta.', 'minimum_term'],
    ['El contrato se renueva automáticamente por periodos iguales salvo cancelación.', 'auto_renewal'],
    ['La baja anticipada conlleva una penalización de 120,00 euros a favor del operador.', 'early_termination_penalty'],
    ['Las cantidades abonadas no son reembolsables en ningún caso previsto.', 'no_refund'],
    ['El proveedor podrá modificar unilateralmente el precio del servicio contratado.', 'price_change'],
    ['Se reserva el derecho de modificar las presentes condiciones en cualquier momento.', 'unilateral_change'],
    ['Toda controversia se resolverá mediante arbitraje vinculante y obligatorio.', 'arbitration'],
    ['El usuario concede a la Sociedad una licencia mundial y gratuita sobre sus contenidos.', 'ip_license'],
    ['El usuario cede todos los derechos de explotación sobre las obras entregadas.', 'ip_assignment'],
    ['Podemos vender tus datos personales a terceros con fines comerciales.', 'data_sale'],
    ['Elaboramos perfiles para mostrarte publicidad personalizada según tu navegación.', 'profiling'],
    ['Tus contenidos podrán utilizarse para entrenar modelos de inteligencia artificial.', 'ai_training'],
    ['Conservaremos tus datos de forma indefinida salvo solicitud de supresión.', 'data_retention'],
    ['Podemos suspender o cancelar tu cuenta en cualquier momento sin previo aviso.', 'account_termination'],
    ['El prestador no será responsable de los daños indirectos derivados del servicio.', 'liability_limitation'],
    ['El usuario renuncia a participar en acciones colectivas contra la compañía.', 'class_action_waiver'],
    ['Se aplicarán gastos de activación por importe de 49,00 euros al alta del servicio.', 'hidden_costs'],
    ['Tus datos podrán transferirse fuera del Espacio Económico Europeo a proveedores.', 'third_party_transfer'],
  ];
  for (const [phrase, category] of cases) {
    const categories = runRules(phrase, {}).findings.map((f) => f.category);
    assert.ok(categories.includes(category), `non riconosciuta (${category}): "${phrase}"`);
  }
});

test('le tutele spagnole non vengono segnalate come rischi', () => {
  const cases = [
    'No existe ninguna penalización por cancelación anticipada del contrato.',
    'El contrato no se renueva automáticamente al llegar a su vencimiento.',
    'No vendemos tus datos personales a terceros bajo ninguna circunstancia.',
    'Puedes darte de baja en cualquier momento sin coste ni penalización alguna.',
    'Los juzgados y tribunales del domicilio del consumidor serán los competentes.',
  ];
  for (const phrase of cases) {
    const { findings } = runRules(phrase, {});
    assert.equal(findings.length, 0, `segnalata: "${phrase}" → ${findings.map((f) => f.category).join(', ')}`);
  }
});

test('le durate spagnole si leggono, anche a parole', () => {
  const cases = [
    ['permanencia mínima de veinticuatro meses', 24],
    ['duración de un año', 12],
    ['plazo de 18 mensualidades', 18],
    ['preaviso de treinta días', 1],
    ['durante dos años', 24],
    ['36 (treinta y seis) meses', 36],
    ['contrato bienal', 24],
  ];
  for (const [phrase, months] of cases) {
    const d = extractDurations(phrase)[0];
    assert.ok(d, `nessuna durata in "${phrase}"`);
    assert.equal(Math.round(d.months), months, `"${phrase}" → ${d.months}`);
  }
});

test('le periodicità e gli importi spagnoli si leggono', () => {
  assert.equal(extractPrices('19,99 € al mes')[0].period, 'month');
  assert.equal(extractPrices('19,99 € mensual')[0].period, 'month');
  assert.equal(extractPrices('199,00 € al año')[0].period, 'year');
  assert.equal(extractPrices('19,99 € cada 28 días')[0].period, 'fourweeks');
  assert.equal(extractPrices('una penalización de 120,00 euros')[0].amount, 120);
  assert.equal(extractPrices('120,50 dólares')[0].currency, 'USD');
});

test('un contratto spagnolo produce un costo e una scadenza', () => {
  const sample = `El contrato tiene una permanencia mínima de veinticuatro meses desde el alta.
Se renueva automáticamente por periodos iguales salvo cancelación con un preaviso de treinta días.
La baja anticipada conlleva una penalización de 120,00 euros.
Se aplicarán gastos de activación por importe de 49,00 euros.`;
  const { findings } = runRules(sample, {});
  const cost = computeCost({
    text: sample,
    ctx: { pricing: { amount: 29.9, currency: 'EUR', period: 'month', recurring: true } },
    findings,
  });
  assert.equal(cost.horizonMonths, 24, `orizzonte ${cost.horizonMonths}`);
  assert.ok((cost.lines || []).some((l) => /penale/i.test(l.label)), 'la penale non entra nel costo');
  assert.equal(cost.worstCase, 886.6, `worstCase ${cost.worstCase}`);
});

/**
 * Tests of the extension's engine: everything that happens **after** the
 * server's answer — severity, cost, deadlines, profile, protections, score —
 * plus the message guards. The server is replaced by a hand-written answer, with
 * quotes copied word for word from the test contract.
 *
 *   node --test test/
 */

import { t } from '../src/i18n/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, htmlToText, hashText } from '../src/core/text.js';
import { computeCost, buildTimeline, termsFromServer, mergePricing } from '../src/core/consequence.js';
import { personalize, multiplierFor } from '../src/core/profile.js';
import { computeScore, aggregateSeverity, moneyPressure, shouldBlock } from '../src/core/scoring.js';
import { runConsumerChecks } from '../src/core/eu.js';
import { analyze, fromServer } from '../src/core/analyzer.js';
import { ServerError } from '../src/core/server.js';
import { levelForScore, DEFAULT_SETTINGS, RISK_CATEGORIES } from '../src/core/constants.js';
import { isAllowed } from '../src/core/sender.js';

// Test contract: the example from the original reflection.
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


/** The answer the server would give to the test contract. */
const q = (category, quote, confidence = 0.95) => {
  assert.ok(CONTRACT.includes(quote), `citazione assente dal contratto: ${quote}`);
  return { category, quote, why: '', confidence };
};
const RESPONSE = () => ({
  findings: [
    q('hidden_costs', 'spese di attivazione una tantum di € 49,00'),
    q('minimum_term', 'durata minima di 12 mesi'),
    q('auto_renewal', 'si rinnova automaticamente per un uguale periodo'),
    q('notice_period', 'preavviso di almeno 30 giorni'),
    q('early_termination_penalty', 'è dovuta una penale pari a € 79,00'),
    q('no_refund', 'Gli importi versati non sono rimborsabili in alcun caso'),
    q('unilateral_change', 'Il fornitore si riserva il diritto di modificare unilateralmente le presenti condizioni'),
    q('ip_license', 'licenza mondiale, gratuita, perpetua e irrevocabile'),
    q('ai_training', "anche per l'addestramento di modelli di intelligenza artificiale"),
    q('data_sharing', 'I dati potranno essere condivisi con terze parti'),
    q('profiling', 'a fini di profilazione e pubblicità personalizzata'),
    q('arbitration', 'Ogni controversia sarà devoluta ad arbitrato rituale'),
    q('jurisdiction', 'Il foro competente esclusivo è quello di Dublino'),
    q('liability_limitation', 'non sarà in alcun modo responsabile per danni'),
  ],
  terms: {
    price: { value: 19.99, quote: '€ 19,99 al mese' },
    currency: { value: 'EUR', quote: '€ 19,99' },
    billing_period: { value: 'month', quote: 'al mese' },
    minimum_term_months: { value: 12, quote: 'durata minima di 12 mesi' },
    notice_days: { value: 30, quote: 'preavviso di almeno 30 giorni' },
    exit_fee: { value: 79, quote: 'penale pari a € 79,00' },
    extra_fees: [{ label: 'Attivazione', value: 49, per_cycle: false, quote: 'spese di attivazione una tantum di € 49,00' }],
  },
  summary: 'Ti impegni per un anno a 19,99 € al mese, con rinnovo automatico.',
  dropped: 0,
  truncated: false,
  model: 'test',
  cached: false,
  quota: { remaining: 59 },
});
const remoteWith = (response) => async () => response;
const T0 = new Date('2026-08-15T10:00:00Z').getTime();
const SETTINGS = { ...DEFAULT_SETTINGS, remoteConsentAt: '2026-08-01T00:00:00.000Z' };

// ── text ────────────────────────────────────────────────────────────────────

test('parseAmount reads Italian and English formats', () => {
  assert.equal(parseAmount('19,99'), 19.99);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234'), 1234);
  assert.equal(parseAmount('49'), 49);
  assert.equal(parseAmount('abc'), null);
});

test('htmlToText removes scripts and tags and decodes entities', () => {
  const text = htmlToText('<div><script>alert(1)</script><p>Prezzo &euro;19,99 &amp; oltre</p></div>');
  assert.ok(!text.includes('alert'));
  assert.ok(text.includes('€19,99 & oltre'));
});

test('hashText is stable and discriminating', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
});

// ── from the server to findings ─────────────────────────────────────────────

test('server risks take label and severity from the constants', () => {
  const findings = fromServer(RESPONSE().findings);
  const ip = findings.find((f) => f.category === 'ip_license');
  assert.equal(ip.label, t(RISK_CATEGORIES.ip_license.label));
  assert.ok(ip.severity <= RISK_CATEGORIES.ip_license.base);
  assert.ok(ip.severity >= Math.round(RISK_CATEGORIES.ip_license.base * 0.8));
  assert.equal(ip.source, 'ai');
  for (let i = 1; i < findings.length; i++) assert.ok(findings[i - 1].severity >= findings[i].severity, 'not sorted');
});

test('an unknown category or one without a quote is ignored', () => {
  const findings = fromServer([
    { category: 'inventata', quote: 'qualcosa', why: '', confidence: 1 },
    { category: 'auto_renewal', quote: '   ', why: '', confidence: 1 },
    { category: 'auto_renewal', quote: 'si rinnova', why: 'Paghi un altro anno.', confidence: 0.9 },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].why, 'Paghi un altro anno.');
});

test('the same category quoted twice stays one, with the most confident quote', () => {
  const findings = fromServer([
    { category: 'no_refund', quote: 'prima', why: '', confidence: 0.6 },
    { category: 'no_refund', quote: 'seconda', why: '', confidence: 0.95 },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].quote, 'seconda');
  assert.deepEqual(findings[0].quotes, ['prima']);
});

test('low confidence lowers severity, but doesn\'t zero it', () => {
  const [sure] = fromServer([{ category: 'arbitration', quote: 'x', why: '', confidence: 1 }]);
  const [unsure] = fromServer([{ category: 'arbitration', quote: 'x', why: '', confidence: 0 }]);
  assert.ok(unsure.severity < sure.severity);
  assert.ok(unsure.severity > 0);
});

// ── consequences ────────────────────────────────────────────────────────────

test('the server\'s figures become term, notice and exit fee', () => {
  const t = termsFromServer(RESPONSE().terms);
  assert.equal(t.minTerm.months, 12);
  assert.equal(t.notice.days, 30);
  assert.equal(t.penalty.amount, 79);
  assert.equal(t.price, 19.99);
  assert.equal(t.period, 'month');
});

test('a non-numeric or negative figure stays out of the totals', () => {
  const t = termsFromServer({ minimum_term_months: { value: 'dodici', quote: 'x' }, exit_fee: { value: -5, quote: 'x' }, notice_days: null });
  assert.equal(t.minTerm, null);
  assert.equal(t.penalty, null);
  assert.equal(t.notice, null);
  assert.deepEqual(termsFromServer(null).minTerm, null);
});

test('the page price wins over the one read in the text', () => {
  const server = termsFromServer(RESPONSE().terms);
  assert.equal(mergePricing({ amount: 24.99, currency: 'EUR', period: 'month' }, server).amount, 24.99);
  const fromText = mergePricing({}, server);
  assert.equal(fromText.amount, 19.99);
  assert.equal(fromText.period, 'month');
  assert.equal(fromText.source, 'server');
});

test('the worst-case cost adds fees, exit fee and one-off costs', () => {
  const findings = fromServer(RESPONSE().findings);
  const terms = termsFromServer(RESPONSE().terms);
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings, terms });
  // 19,99 × 12 = 239,88  +  79 penale  +  49 attivazione  =  367,88
  assert.equal(cost.worstCase, 367.88);
  assert.ok(cost.lines.some((l) => l.kind === 'extra' && l.label === 'Attivazione' && l.amount === 49));
  assert.equal(cost.horizonMonths, 12);
  assert.ok(cost.understated, 'il prezzo mostrato sottostima nettamente l’impegno');
});

test('a per-instalment charge is multiplied by the cycles', () => {
  const terms = termsFromServer({ ...RESPONSE().terms, exit_fee: null, extra_fees: [{ label: 'Incasso', value: 2, per_cycle: true, quote: 'x' }] });
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings: [], terms });
  const line = cost.lines.find((l) => l.kind === 'extra');
  assert.equal(line.amount, 24, '2 € per 12 rate');
  assert.match(line.label, /× 12/);
});

test('an extra cost without a valid figure stays out of the totals', () => {
  const t = termsFromServer({ extra_fees: [{ label: 'x', value: 0, per_cycle: false, quote: 'q' }, { label: 'y', value: 'tanti', quote: 'q' }, null] });
  assert.deepEqual(t.extras, []);
  assert.deepEqual(termsFromServer({}).extras, []);
});

test('without a minimum term but with automatic renewal one year is assumed', () => {
  const ctx = { pricing: { amount: 10, currency: 'EUR', period: 'month', recurring: true } };
  const findings = fromServer([{ category: 'auto_renewal', quote: 'si rinnova', why: '', confidence: 0.9 }]);
  const cost = computeCost({ ctx, findings, terms: termsFromServer({}) });
  assert.equal(cost.horizonMonths, 12);
  assert.equal(cost.worstCase, 120);
});

test('the timeline puts the cancellation deadline before the renewal', () => {
  const findings = fromServer(RESPONSE().findings);
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings, terms: termsFromServer(RESPONSE().terms) });
  const timeline = buildTimeline({ ctx: CTX_SUBSCRIPTION, cost, findings, actionType: 'subscribe', now: T0 });

  const deadline = timeline.find((s) => s.kind === 'deadline');
  const renewal = timeline.find((s) => s.kind === 'renewal');
  assert.ok(deadline, 'manca la scadenza di disdetta');
  assert.ok(renewal, 'manca il rinnovo');
  assert.ok(new Date(deadline.at) < new Date(renewal.at));
  // 12 months minus 30 days of notice → mid July 2027
  assert.match(deadline.when, /luglio 2027/);
});

// ── personal profile ────────────────────────────────────────────────────────

test('the profile changes the severity of the same clause', () => {
  const findings = fromServer(RESPONSE().findings);
  const base = findings.find((f) => f.category === 'ip_license').severity;

  const ordinaryUser = personalize(findings, { money: true, privacy: true }).find((f) => f.category === 'ip_license');
  const photographer = personalize(findings, { money: true, privacy: true, ip: true, freelance: true }).find((f) => f.category === 'ip_license');

  assert.ok(photographer.severity > ordinaryUser.severity, 'il fotografo deve vedere un rischio maggiore');
  assert.ok(photographer.severity > base);
  assert.deepEqual(photographer.personalReasons, ['Proprietà intellettuale', 'Lavoro freelance / professionale']);
});

test('the multiplier is capped, with diminishing returns', () => {
  const all = multiplierFor('ai_training', { ip: true, privacy: true, freelance: true, business: true });
  assert.ok(all.multiplier <= 1.9);
  assert.ok(all.multiplier > 1.45);
});

// ── score ───────────────────────────────────────────────────────────────────

test('aggregateSeverity lets the most serious risk dominate', () => {
  const one = aggregateSeverity([{ severity: 80 }]);
  const ten = aggregateSeverity(Array.from({ length: 10 }, () => ({ severity: 30 })));
  assert.ok(one > ten, 'un rischio grave deve pesare più di dieci tiepidi');
});

test('economic pressure grows logarithmically and is capped', () => {
  // Assertions on *behaviour*, not numbers: the cap is a calibration parameter
  // and will change again. That it is monotonic and capped won't.
  assert.equal(moneyPressure(0), 0);
  assert.equal(moneyPressure(-5), 0);
  let previous = -1;
  for (const amount of [10, 50, 200, 900, 5000, 20000, 500000]) {
    const v = moneyPressure(amount);
    assert.ok(v >= previous, `non monotona in ${amount}`);
    assert.ok(v < 50, `contributo sproporzionato per ${amount} €: ${v}`);
    previous = v;
  }
  // Growth must slow down: doubling the amount doesn't double the weight.
  const d1 = moneyPressure(200) - moneyPressure(100);
  const d2 = moneyPressure(20000) - moneyPressure(10000);
  assert.ok(Math.abs(d1 - d2) <= 2, 'la scala non è logaritmica');
});

test('the levels cover the scale with no gaps and in order', () => {
  // Thresholds come from calibration (test/calibration.test.mjs) and will move
  // again: here we only check that the scale stays continuous, monotonic and
  // complete.
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

test('shouldBlock respects the threshold chosen by the user', () => {
  assert.equal(shouldBlock('review', 'commitment'), false);
  assert.equal(shouldBlock('commitment', 'commitment'), true);
  assert.equal(shouldBlock('critical', 'high_risk'), true);
  assert.equal(shouldBlock('high_risk', 'critical'), false);
});

test('a single weak clue doesn\'t trigger the red alert', () => {
  const { score, level } = computeScore({
    findings: [{ severity: 60, confidence: 0.6, category: 'jurisdiction' }],
    cost: {},
    consumer: {},
    actionType: 'accept_terms',
  });
  assert.ok(score <= 44, `punteggio troppo alto: ${score}`);
  assert.notEqual(level.id, 'critical');
});

// ── EU/IT consumer engine ───────────────────────────────────────────────────

test('the Italian engine flags arbitration, court and unilateral changes', () => {
  const findings = fromServer(RESPONSE().findings);
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings, terms: termsFromServer(RESPONSE().terms) });
  const consumer = runConsumerChecks({ text: CONTRACT, findings, ctx: CTX_SUBSCRIPTION, cost, actionType: 'subscribe', jurisdiction: 'IT' });

  const ids = consumer.flags.map((f) => f.id);
  assert.ok(ids.includes('eu.arbitration'));
  assert.ok(ids.includes('eu.jurisdiction'));
  assert.ok(ids.includes('eu.unilateral'));
  assert.ok(ids.includes('eu.withdrawal'), 'manca il diritto di recesso non menzionato');
  assert.ok(consumer.boost > 0 && consumer.boost <= 25, 'il contributo va smorzato');
  assert.ok(consumer.disclaimer.length > 0);
});

test('outside the EU/IT the consumer engine doesn\'t kick in', () => {
  const findings = fromServer(RESPONSE().findings);
  const consumer = runConsumerChecks({ text: CONTRACT, findings, jurisdiction: 'US' });
  assert.equal(consumer.applicable, false);
  assert.equal(consumer.boost, 0);
});

test('pre-ticked consent is flagged as invalid', () => {
  const ctx = { form: { precheckedConsents: 1 } };
  const findings = [{ category: 'profiling', severity: 40 }];
  const consumer = runConsumerChecks({ text: 'profilazione', findings, ctx, jurisdiction: 'IT' });
  assert.ok(consumer.flags.some((f) => f.id === 'eu.consent_bundled'));
});

// ── full pipeline ───────────────────────────────────────────────────────────

test('end-to-end analysis: numbers, level and deadline', async () => {
  const settings = { ...SETTINGS, jurisdiction: 'IT', profile: { money: true, privacy: true, identity: true } };
  const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings, now: T0, remote: remoteWith(RESPONSE()) });

  assert.equal(v.cost.worstCase, 367.88);
  assert.ok(['high_risk', 'critical'].includes(v.level.id), `livello inatteso: ${v.level.id}`);
  assert.match(v.mustRemember, /luglio 2027/);
  assert.ok(v.headline.includes('367'), `headline poco concreta: ${v.headline}`);
  assert.equal(v.summary, RESPONSE().summary);
  assert.ok(v.consumer.flags.length >= 3);
  assert.equal(v.engine.source, 'server');
  assert.equal(v.engine.quota.remaining, 59);
  assert.ok(v.drivers.length > 0);
});

test('text, action, button, address and jurisdiction reach the server', async () => {
  let sent = null;
  await analyze({
    text: `  ${CONTRACT}  `,
    ctx: CTX_SUBSCRIPTION,
    actionType: 'subscribe',
    settings: { ...SETTINGS, jurisdiction: 'ES' },
    remote: async (req) => { sent = req; return RESPONSE(); },
  });
  assert.equal(sent.actionType, 'subscribe');
  assert.equal(sent.url, CTX_SUBSCRIPTION.url);
  assert.equal(sent.button, 'Conferma abbonamento');
  assert.equal(sent.jurisdiction, 'ES');
  assert.equal(sent.text, sent.text.trim());
});

test('the same contract weighs more for a creative freelancer', async () => {
  const run = (profile) => analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: { ...SETTINGS, profile }, remote: remoteWith(RESPONSE()) });
  const plain = await run({ money: true });
  const creative = await run({ money: true, ip: true, freelance: true });
  assert.ok(creative.score >= plain.score, 'il profilo creativo non deve abbassare il rischio');
  assert.ok(creative.findings.find((f) => f.category === 'ip_license').personalized);
});

test('a page without risks stays green and doesn\'t block', async () => {
  const v = await analyze({
    text: 'Iscriviti alla newsletter per ricevere tre articoli a settimana. Puoi annullare l’iscrizione quando vuoi dal link in fondo alla email. Non condividiamo il tuo indirizzo con nessuno.',
    ctx: { url: 'https://blog.test', pricing: {}, form: {}, terms: {} },
    actionType: 'signup',
    settings: SETTINGS,
    remote: remoteWith({ findings: [], terms: {}, summary: '' }),
  });
  assert.equal(v.level.id, 'safe');
  assert.equal(shouldBlock(v.level.id, SETTINGS.blockFrom), false);
  assert.ok(v.summary.length > 0, 'senza riassunto del server serve quello dell’estensione');
});

test('if the server doesn\'t answer the analysis fails, it doesn\'t fake a verdict', async () => {
  await assert.rejects(
    analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: SETTINGS, remote: async () => { throw new ServerError('quota', { status: 429 }); } }),
    (err) => err instanceof ServerError && err.code === 'quota'
  );
});

test('a page analysed only in part says so', async () => {
  const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: SETTINGS, remote: remoteWith({ ...RESPONSE(), truncated: true }) });
  assert.equal(v.engine.truncated, true);
});

// ── surface exposed to content scripts ─────────────────────────────────────

const ID = 'abcdefghijklmnopqrstuvwxyzabcdef';
const BASE = `chrome-extension://${ID}/`;

test('a web page cannot ask for the full settings', () => {
  const page = { id: ID, url: 'https://negozio.example/checkout', tab: { id: 7 } };
  for (const type of ['GET_SETTINGS', 'SET_SETTINGS', 'GET_PROOF', 'BUILD_LETTER']) {
    assert.equal(isAllowed(type, page, ID, BASE), false, `${type} consentito a una pagina web`);
  }
});

test('the panel opened as a tab stays authorised', () => {
  // The deadline notification opens the panel with chrome.tabs.create, so
  // `sender.tab` is defined: a guard based on that would block it.
  const panel = { id: ID, url: `${BASE}src/sidepanel/sidepanel.html`, tab: { id: 9 } };
  const options = { id: ID, url: `${BASE}src/options/options.html` };
  for (const sender of [panel, options]) {
    assert.ok(isAllowed('GET_SETTINGS', sender, ID, BASE));
    assert.ok(isAllowed('SET_SETTINGS', sender, ID, BASE));
  }
});

test('non-privileged messages stay open to everyone', () => {
  const page = { id: ID, url: 'https://negozio.example/checkout', tab: { id: 7 } };
  for (const type of ['ANALYZE_ACTION', 'GRANT_CONSENT', 'RECORD_DECISION', 'ALLOWLIST_ADD', 'GET_CONTENT_SETTINGS']) {
    assert.ok(isAllowed(type, page, ID, BASE), `${type} bloccato a un content script`);
  }
});

test('a different extension doesn\'t pass the guard', () => {
  const other = { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: `${BASE}src/options/options.html` };
  assert.equal(isAllowed('GET_SETTINGS', other, ID, BASE), false);
});

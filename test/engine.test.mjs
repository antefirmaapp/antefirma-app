/**
 * Test del motore dell'estensione: tutto ciò che succede **dopo** la risposta
 * del server — severità, costo, scadenze, profilo, tutele, punteggio — più le
 * guardie dei messaggi. Il server è sostituito da una risposta scritta a mano,
 * con citazioni copiate parola per parola dal contratto di prova.
 *
 *   node --test test/
 */

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


/** La risposta che il server darebbe al contratto di prova. */
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

test('parseAmount interpreta i formati italiano e inglese', () => {
  assert.equal(parseAmount('19,99'), 19.99);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234'), 1234);
  assert.equal(parseAmount('49'), 49);
  assert.equal(parseAmount('abc'), null);
});

test('htmlToText rimuove script e tag e decodifica le entità', () => {
  const text = htmlToText('<div><script>alert(1)</script><p>Prezzo &euro;19,99 &amp; oltre</p></div>');
  assert.ok(!text.includes('alert'));
  assert.ok(text.includes('€19,99 & oltre'));
});

test('hashText è stabile e discrimina', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
});

// ── dal server ai finding ───────────────────────────────────────────────────

test('i rischi del server prendono etichetta e severità dalle costanti', () => {
  const findings = fromServer(RESPONSE().findings);
  const ip = findings.find((f) => f.category === 'ip_license');
  assert.equal(ip.label, RISK_CATEGORIES.ip_license.label);
  assert.ok(ip.severity <= RISK_CATEGORIES.ip_license.base);
  assert.ok(ip.severity >= Math.round(RISK_CATEGORIES.ip_license.base * 0.8));
  assert.equal(ip.source, 'ai');
  for (let i = 1; i < findings.length; i++) assert.ok(findings[i - 1].severity >= findings[i].severity, 'non ordinati');
});

test('una categoria sconosciuta o senza citazione viene ignorata', () => {
  const findings = fromServer([
    { category: 'inventata', quote: 'qualcosa', why: '', confidence: 1 },
    { category: 'auto_renewal', quote: '   ', why: '', confidence: 1 },
    { category: 'auto_renewal', quote: 'si rinnova', why: 'Paghi un altro anno.', confidence: 0.9 },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].why, 'Paghi un altro anno.');
});

test('la stessa categoria citata due volte resta una, con la citazione più sicura', () => {
  const findings = fromServer([
    { category: 'no_refund', quote: 'prima', why: '', confidence: 0.6 },
    { category: 'no_refund', quote: 'seconda', why: '', confidence: 0.95 },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].quote, 'seconda');
  assert.deepEqual(findings[0].quotes, ['prima']);
});

test('una fiducia bassa abbassa la severità, ma non la azzera', () => {
  const [sure] = fromServer([{ category: 'arbitration', quote: 'x', why: '', confidence: 1 }]);
  const [unsure] = fromServer([{ category: 'arbitration', quote: 'x', why: '', confidence: 0 }]);
  assert.ok(unsure.severity < sure.severity);
  assert.ok(unsure.severity > 0);
});

// ── conseguenze ─────────────────────────────────────────────────────────────

test('le cifre del server diventano durata, preavviso e penale', () => {
  const t = termsFromServer(RESPONSE().terms);
  assert.equal(t.minTerm.months, 12);
  assert.equal(t.notice.days, 30);
  assert.equal(t.penalty.amount, 79);
  assert.equal(t.price, 19.99);
  assert.equal(t.period, 'month');
});

test('una cifra non numerica o negativa non entra nei conti', () => {
  const t = termsFromServer({ minimum_term_months: { value: 'dodici', quote: 'x' }, exit_fee: { value: -5, quote: 'x' }, notice_days: null });
  assert.equal(t.minTerm, null);
  assert.equal(t.penalty, null);
  assert.equal(t.notice, null);
  assert.deepEqual(termsFromServer(null).minTerm, null);
});

test('il prezzo della pagina vince su quello letto nel testo', () => {
  const server = termsFromServer(RESPONSE().terms);
  assert.equal(mergePricing({ amount: 24.99, currency: 'EUR', period: 'month' }, server).amount, 24.99);
  const fromText = mergePricing({}, server);
  assert.equal(fromText.amount, 19.99);
  assert.equal(fromText.period, 'month');
  assert.equal(fromText.source, 'server');
});

test('il costo worst-case somma canone e penale', () => {
  const findings = fromServer(RESPONSE().findings);
  const terms = termsFromServer(RESPONSE().terms);
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings, terms });
  // 19,99 × 12 = 239,88  +  79 penale  =  318,88
  assert.equal(cost.worstCase, 318.88);
  assert.equal(cost.horizonMonths, 12);
  assert.ok(cost.understated, 'il prezzo mostrato sottostima nettamente l’impegno');
});

test('senza durata minima ma con rinnovo automatico si assume un anno', () => {
  const ctx = { pricing: { amount: 10, currency: 'EUR', period: 'month', recurring: true } };
  const findings = fromServer([{ category: 'auto_renewal', quote: 'si rinnova', why: '', confidence: 0.9 }]);
  const cost = computeCost({ ctx, findings, terms: termsFromServer({}) });
  assert.equal(cost.horizonMonths, 12);
  assert.equal(cost.worstCase, 120);
});

test('la timeline mette la scadenza di disdetta prima del rinnovo', () => {
  const findings = fromServer(RESPONSE().findings);
  const cost = computeCost({ ctx: CTX_SUBSCRIPTION, findings, terms: termsFromServer(RESPONSE().terms) });
  const timeline = buildTimeline({ ctx: CTX_SUBSCRIPTION, cost, findings, actionType: 'subscribe', now: T0 });

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
  const findings = fromServer(RESPONSE().findings);
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

test('fuori da UE/IT il motore consumer non si attiva', () => {
  const findings = fromServer(RESPONSE().findings);
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

// ── pipeline completa ───────────────────────────────────────────────────────

test('analisi end-to-end: numeri, livello e scadenza', async () => {
  const settings = { ...SETTINGS, jurisdiction: 'IT', profile: { money: true, privacy: true, identity: true } };
  const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings, now: T0, remote: remoteWith(RESPONSE()) });

  assert.equal(v.cost.worstCase, 318.88);
  assert.ok(['high_risk', 'critical'].includes(v.level.id), `livello inatteso: ${v.level.id}`);
  assert.match(v.mustRemember, /luglio 2027/);
  assert.ok(v.headline.includes('318'), `headline poco concreta: ${v.headline}`);
  assert.equal(v.summary, RESPONSE().summary);
  assert.ok(v.consumer.flags.length >= 3);
  assert.equal(v.engine.source, 'server');
  assert.equal(v.engine.quota.remaining, 59);
  assert.ok(v.drivers.length > 0);
});

test('al server arrivano testo, azione, pulsante, indirizzo e giurisdizione', async () => {
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

test('lo stesso contratto pesa di più per un freelance creativo', async () => {
  const run = (profile) => analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: { ...SETTINGS, profile }, remote: remoteWith(RESPONSE()) });
  const plain = await run({ money: true });
  const creative = await run({ money: true, ip: true, freelance: true });
  assert.ok(creative.score >= plain.score, 'il profilo creativo non deve abbassare il rischio');
  assert.ok(creative.findings.find((f) => f.category === 'ip_license').personalized);
});

test('una pagina senza rischi resta verde e non blocca', async () => {
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

test('se il server non risponde l’analisi fallisce, non finge un verdetto', async () => {
  await assert.rejects(
    analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: SETTINGS, remote: async () => { throw new ServerError('quota', { status: 429 }); } }),
    (err) => err instanceof ServerError && err.code === 'quota'
  );
});

test('una pagina analizzata solo in parte lo dichiara', async () => {
  const v = await analyze({ text: CONTRACT, ctx: CTX_SUBSCRIPTION, actionType: 'subscribe', settings: SETTINGS, remote: remoteWith({ ...RESPONSE(), truncated: true }) });
  assert.equal(v.engine.truncated, true);
});

// ── superficie esposta ai content script ────────────────────────────────────

const ID = 'abcdefghijklmnopqrstuvwxyzabcdef';
const BASE = `chrome-extension://${ID}/`;

test('una pagina web non può chiedere le impostazioni integrali', () => {
  const page = { id: ID, url: 'https://negozio.example/checkout', tab: { id: 7 } };
  for (const type of ['GET_SETTINGS', 'SET_SETTINGS', 'GET_PROOF', 'BUILD_LETTER']) {
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
  for (const type of ['ANALYZE_ACTION', 'GRANT_CONSENT', 'RECORD_DECISION', 'ALLOWLIST_ADD', 'GET_CONTENT_SETTINGS']) {
    assert.ok(isAllowed(type, page, ID, BASE), `${type} bloccato a un content script`);
  }
});

test('un’estensione diversa non passa la guardia', () => {
  const other = { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: `${BASE}src/options/options.html` };
  assert.equal(isAllowed('GET_SETTINGS', other, ID, BASE), false);
});

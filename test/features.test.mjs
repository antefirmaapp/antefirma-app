/**
 * Tests of the features added after the first release: on-device model,
 * speculative analysis, proof of what you accepted, exit kit.
 *
 *   node --test test/features.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyzer.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { createSnapshot, compareSnapshot, sha256, attestation } from '../src/core/proof.js';
import {
  buildCommitment, planReminders, dueReminder, missedWindow, commitmentState,
  costOfDoingNothing, portfolioSummary, COMMITMENT_STATUS, REMINDER_OFFSETS_DAYS,
} from '../src/core/commitments.js';
import { buildIcs } from '../src/core/ics.js';
import { buildLetter, suggestKind, LETTER_KINDS } from '../src/core/letter.js';

const CONTRACT = `
1. Corrispettivo. Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.
2. Durata. Il contratto ha una durata minima di 24 mesi a decorrere dalla data di attivazione.
3. Rinnovo. Alla scadenza il contratto si rinnova automaticamente per un uguale periodo, salvo disdetta
da comunicarsi con preavviso di almeno 60 giorni.
4. Recesso anticipato. In caso di recesso prima della scadenza è dovuta una penale pari a € 120,00.
5. Rimborsi. Gli importi versati non sono rimborsabili in alcun caso.
6. Controversie. Ogni controversia sarà devoluta ad arbitrato rituale.
`;

const CTX = {
  url: 'https://streampro.test/checkout',
  title: 'StreamPro Premium',
  pricing: { amount: 19.99, currency: 'EUR', period: 'month', recurring: true },
  terms: { url: 'https://streampro.test/termini', found: true },
};

const T0 = new Date('2026-08-15T10:00:00Z').getTime();

/**
 * The answer the server would give to the contract: quotes are copied from the
 * text, figures carry the passage they come from. `text` allows using it on a
 * modified version of the contract too.
 */
function serverResponse(text = CONTRACT, { penalty = 120, extra = [] } = {}) {
  const f = (category, quote) => {
    assert.ok(text.includes(quote), `citazione assente: ${quote}`);
    return { category, quote, why: '', confidence: 0.95 };
  };
  return {
    findings: [
      f('minimum_term', 'durata minima di 24 mesi'),
      f('auto_renewal', 'si rinnova automaticamente per un uguale periodo'),
      f('notice_period', 'preavviso di almeno 60 giorni'),
      f('early_termination_penalty', 'è dovuta una penale pari a'),
      f('no_refund', 'Gli importi versati non sono rimborsabili in alcun caso'),
      f('arbitration', 'Ogni controversia sarà devoluta ad arbitrato rituale'),
      ...extra.map(([c, q]) => f(c, q)),
    ],
    terms: {
      price: { value: 19.99, quote: '€ 19,99 al mese' },
      currency: { value: 'EUR', quote: '€ 19,99' },
      billing_period: { value: 'month', quote: 'al mese' },
      minimum_term_months: { value: 24, quote: 'durata minima di 24 mesi' },
      notice_days: { value: 60, quote: 'preavviso di almeno 60 giorni' },
      exit_fee: { value: penalty, quote: 'penale pari a' },
      extra_fees: [{ label: 'Attivazione', value: 49, per_cycle: false, quote: 'spese di attivazione una tantum di € 49,00' }],
    },
    summary: 'Abbonamento di due anni con penale di uscita.',
  };
}

async function verdictFor(settings = {}, response = serverResponse()) {
  return analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, remoteConsentAt: '2026-08-01T00:00:00.000Z', ...settings },
    now: T0,
    remote: async () => response,
  });
}

// ── 3. proof of what you accepted ───────────────────────────────────────────

test('the snapshot records fingerprint, date and the verdict\'s numbers', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });

  assert.match(snap.hash, /^[0-9a-f]{64}$/);
  assert.equal(snap.hash, await sha256(snap.text));
  assert.equal(snap.at, new Date(T0).toISOString());
  assert.equal(snap.verdict.worstCase, 648.76);
  assert.ok(snap.verdict.categories.includes('auto_renewal'));
  assert.ok(snap.excerpt.length > 100);
});

test('an identical text produces the same fingerprint, a different one doesn\'t', async () => {
  const a = await createSnapshot({ text: CONTRACT, verdict: {}, now: T0 });
  const b = await createSnapshot({ text: CONTRACT, verdict: {}, now: T0 + 1000 });
  const c = await createSnapshot({ text: CONTRACT.replace('24 mesi', '36 mesi'), verdict: {}, now: T0 });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('the comparison says how much the commitment changed, not that "the terms changed"', async () => {
  const before = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict: before, now: T0 });

  // The provider doubles the exit fee and adds unilateral price changes.
  const after = CONTRACT
    .replace('€ 120,00', '€ 300,00')
    .concat('\n7. Il fornitore può modificare unilateralmente il prezzo del servizio.');
  const newVerdict = await analyze({
    text: after,
    ctx: CTX,
    actionType: 'subscribe',
    settings: DEFAULT_SETTINGS,
    now: T0,
    remote: async () => serverResponse(after, { penalty: 300, extra: [['price_change', 'può modificare unilateralmente il prezzo del servizio']] }),
  });

  const diff = compareSnapshot(snap, { text: after, verdict: newVerdict, newHash: await sha256(after) });

  assert.equal(diff.changed, true);
  assert.equal(diff.hashChanged, true);
  assert.equal(diff.severity, 'major');
  assert.equal(diff.costDelta, 180, 'la penale è passata da 120 a 300');
  assert.ok(diff.added.includes('price_change'));
  assert.match(diff.summary, /impegno potenziale è salito/);
});

test('unchanged terms raise no alarm', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });
  const diff = compareSnapshot(snap, { text: CONTRACT, verdict, newHash: snap.hash });

  assert.equal(diff.changed, false);
  assert.equal(diff.severity, 'none');
  assert.match(diff.summary, /identiche/);
});

test('the attestation contains the fingerprint and is honest about its own value', async () => {
  const snap = await createSnapshot({ text: CONTRACT, verdict: await verdictFor(), now: T0 });
  const text = attestation(snap, { host: 'streampro.test' });
  assert.ok(text.includes(snap.hash));
  assert.ok(/non è una certificazione con valore legale autonomo/i.test(text));
});

// ── 4. exit kit ────────────────────────────────────────────────────────────

test('the commitment is born from the verdict with consistent deadlines', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });
  const c = buildCommitment({ verdict, snapshot: snap, now: T0 });

  assert.equal(c.status, COMMITMENT_STATUS.ACTIVE);
  assert.equal(c.horizonMonths, 24);
  assert.equal(Math.round(c.noticeMonths * 30), 60);
  assert.equal(c.worstCase, 648.76);
  assert.equal(c.penalty, 120);
  assert.equal(c.autoRenewal, true);
  assert.equal(c.provider, 'Streampro');
  assert.equal(c.termsUrl, 'https://streampro.test/termini');

  // 15 agosto 2026 + 24 mesi = 15 agosto 2028; meno 60 giorni ≈ 16 giugno 2028.
  assert.match(new Date(c.renewalAt).toISOString(), /^2028-08-15/);
  assert.match(new Date(c.deadlineAt).toISOString(), /^2028-06-1[56]/);
  assert.ok(new Date(c.deadlineAt) < new Date(c.renewalAt));
});

test('the reminder plan covers 30, 7 and 1 day before the deadline', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const plan = planReminders(c, T0);
  assert.deepEqual(plan.map((r) => r.days), REMINDER_OFFSETS_DAYS.slice().sort((a, b) => b - a));
  const deadline = new Date(c.deadlineAt).getTime();
  for (const r of plan) {
    assert.ok(new Date(r.at).getTime() < deadline, 'un promemoria dopo la scadenza è inutile');
    assert.equal(r.fired, false);
  }
});

test('the daily pass picks a single reminder, the most urgent', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const c = { ...base, reminders: planReminders(base, T0) };
  const deadline = new Date(c.deadlineAt).getTime();

  // Much earlier: nothing to say.
  assert.equal(dueReminder(c, T0), null);

  // 20 days before the deadline the 30-day one is due, not yet the 7-day one.
  const twenty = deadline - 20 * 86_400_000;
  assert.equal(dueReminder(c, twenty).days, 30);

  // Two days before the deadline the 1-day one is not due yet.
  assert.equal(dueReminder(c, deadline - 2 * 86_400_000).days, 7);

  // After a long browser pause all three would be due: only one comes out, the
  // most urgent. Three notifications in a row get switched off, not read.
  const few = deadline - 6 * 3_600_000;
  assert.equal(dueReminder(c, few).days, 1);

  // Once marked as sent, they stay quiet.
  const sent = { ...c, reminders: c.reminders.map((r) => ({ ...r, fired: true })) };
  assert.equal(dueReminder(sent, few), null);

  // A cancelled commitment doesn't disturb any more.
  assert.equal(dueReminder({ ...c, status: 'cancelled' }, few), null);
});

test('a window that closed while the browser was off is still reported', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const c = { ...base, reminders: planReminders(base, T0) };
  const after = new Date(c.deadlineAt).getTime() + 5 * 86_400_000;

  // The case that used to produce silence: no reminder is due any more…
  assert.equal(dueReminder(c, after), null);
  // …but the user must know the contract renewed.
  assert.equal(missedWindow(c, after), true);
  // Only once, though.
  assert.equal(missedWindow({ ...c, missedNotified: true }, after), false);
  assert.equal(missedWindow(c, T0), false);
});

test('whoever discovers the extension close to the deadline is warned at once, with the right number', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const late = new Date(base.deadlineAt).getTime() - 10 * 86_400_000;
  const plan = planReminders(base, late);

  // The "30 days left" reminder has a date already gone: it is born used,
  // otherwise it would fire saying something false.
  const thirty = plan.find((r) => r.days === 30);
  assert.equal(thirty.fired, true);

  // In its place there is an immediate one, with the real days.
  const urgente = plan.find((r) => r.kind === 'urgent');
  assert.ok(urgente, 'manca il promemoria immediato');
  assert.equal(urgente.days, 10);
  assert.equal(urgente.fired, false);

  const c = { ...base, reminders: plan };
  assert.equal(dueReminder(c, late).days, 10, 'è lui che deve partire per primo');
});

test('the state says how long is left and what doing nothing costs', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const deadline = new Date(c.deadlineAt).getTime();

  assert.equal(commitmentState(c, deadline - 3 * 86_400_000).urgency, 'critical');
  assert.equal(commitmentState(c, deadline - 20 * 86_400_000).urgency, 'soon');
  assert.equal(commitmentState(c, T0).urgency, 'later');
  assert.equal(commitmentState(c, deadline + 86_400_000).urgency, 'passed');
  assert.equal(commitmentState({ ...c, status: 'cancelled' }, T0).urgency, 'done');

  const doing = costOfDoingNothing(c);
  assert.ok(doing.label.includes('Se non disdici'));
});

test('the summary adds up exposure and finds the next deadline', async () => {
  const a = buildCommitment({ verdict: await verdictFor(), now: T0, id: 'a' });
  const b = { ...a, id: 'b', worstCase: 100, deadlineAt: new Date(T0 + 5 * 86_400_000).toISOString() };
  const c = { ...a, id: 'c', status: 'cancelled', worstCase: 999 };

  const s = portfolioSummary([a, b, c], T0);
  assert.equal(s.count, 2, 'gli impegni disdetti non contano nell’esposizione');
  assert.equal(s.totals[0].amount, 748.76);
  assert.equal(s.next.c.id, 'b');
  assert.equal(s.urgent, 1);
});

test('the .ics file is valid and carries the reminders into the calendar', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const ics = buildIcs(c, { now: T0 });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'disdetta e rinnovo');
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 3);
  assert.ok(ics.includes('TRIGGER:-P30D'));
  assert.match(ics, /DTSTART;VALUE=DATE:20280(6|7)\d{2}/);
  // Lines must not exceed 75 octets, or the file is invalid.
  for (const line of ics.split('\r\n')) {
    assert.ok(line.length <= 75, `riga troppo lunga: ${line.slice(0, 40)}…`);
  }
  // Commas in descriptions must be escaped.
  assert.ok(!/[^\\],.*DESCRIPTION/.test(ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION')) || ''));
});

test('the right letter depends on how much time has passed', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  assert.equal(suggestKind(c, T0 + 3 * 86_400_000), LETTER_KINDS.WITHDRAWAL, 'entro 14 giorni: recesso');
  assert.equal(suggestKind(c, T0 + 200 * 86_400_000), LETTER_KINDS.CANCELLATION, 'dopo: disdetta');

  const altered = { ...c, changes: [{ severity: 'major', summary: 'il prezzo è salito' }] };
  assert.equal(suggestKind(altered, T0 + 200 * 86_400_000), LETTER_KINDS.CHANGE);
});

test('the cancellation letter is complete and quotes the right law', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const identity = { name: 'Mario Rossi', address: 'Via Roma 1, Milano', email: 'mario@esempio.it', customerId: 'AB-123' };
  const letter = buildLetter(c, identity, LETTER_KINDS.CANCELLATION, T0 + 200 * 86_400_000);

  assert.equal(letter.kind, LETTER_KINDS.CANCELLATION);
  assert.ok(letter.text.includes('Mario Rossi'));
  assert.ok(letter.text.includes('AB-123'));
  assert.ok(letter.text.includes('Streampro'));
  assert.ok(letter.text.includes('60 giorni'), 'deve riportare il preavviso reale');
  assert.ok(letter.text.includes('art. 33 c. 2 lett. i)'));
  assert.ok(letter.text.includes('raccomandata A/R'));
  assert.ok(!letter.text.includes('[Nome e cognome]'), 'i dati forniti devono sostituire i segnaposto');
  assert.ok(letter.checklist.length >= 3);
  assert.match(letter.filename, /^disdetta-streampro-\d{4}-\d{2}-\d{2}\.txt$/);
});

test('without the user\'s details the letter stays usable, with placeholders', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const letter = buildLetter(c, {}, LETTER_KINDS.WITHDRAWAL, T0);
  assert.ok(letter.text.includes('[Nome e cognome]'));
  assert.ok(letter.text.includes('quattordici giorni'));
  assert.ok(letter.text.includes('artt. 52-59'));
});

test('the withdrawal letter after a change refers to the changed clause', async () => {
  const c = {
    ...buildCommitment({ verdict: await verdictFor(), now: T0 }),
    changes: [{ severity: 'major', summary: 'Il tuo impegno potenziale è salito da 648,76 € a 828,76 €.' }],
  };
  const letter = buildLetter(c, { name: 'Mario Rossi' }, LETTER_KINDS.CHANGE, T0 + 300 * 86_400_000);
  assert.ok(letter.text.includes('828,76'));
  assert.ok(letter.text.includes('senza penali'));
  assert.ok(letter.text.includes('art. 33 c. 2 lett. m)'));
});

test('the letter quotes the snapshot fingerprint as a reference', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });
  const c = buildCommitment({ verdict, snapshot: snap, now: T0 });
  const letter = buildLetter(c, { name: 'Mario Rossi' }, LETTER_KINDS.CANCELLATION, T0);
  assert.ok(letter.text.includes(snap.hash.slice(0, 32)));
});

test('a commitment without consequences over time produces no deadlines', () => {
  const c = buildCommitment({
    verdict: { host: 'blog.test', level: { id: 'safe' }, cost: {}, findings: [] },
    now: T0,
  });
  assert.equal(c.deadlineAt, null);
  assert.equal(buildIcs(c), null);
  assert.deepEqual(planReminders(c, T0), []);
  assert.equal(commitmentState(c, T0).urgency, 'none');
});

// ── a proof without text is not a proof ─────────────────────────────────────

test('a snapshot without text declares itself empty', async () => {
  const empty = await createSnapshot({ text: '', verdict: {} });
  assert.equal(empty.empty, true);
  assert.equal(empty.chars, 0);
});

test('the snapshot of a real contract is not empty', async () => {
  const complete = await createSnapshot({ text: CONTRACT, verdict: {} });
  assert.equal(complete.empty, false);
  assert.equal(complete.hash, await sha256(complete.text));
});

test('the fingerprint of the empty string must not pass for a successful verification', async () => {
  const a = await createSnapshot({ text: '', verdict: {} });
  const b = await createSnapshot({ text: '   ', verdict: {} });
  // The two fingerprints match: exactly why the flag is needed.
  assert.equal(a.hash, b.hash);
  assert.ok(a.empty && b.empty, 'senza il flag, la verifica direbbe «✓ corrisponde»');
});

test('an exit fee in monthly payments enters the total, in three languages', async () => {
  const { computeCost } = await import('../src/core/consequence.js');
  const base = { ctx: { pricing: { amount: 39, period: 'month', currency: 'EUR' } }, terms: { minTerm: { months: 12, raw: '12 mesi' }, extras: [{ amount: 49, label: 'Quota di iscrizione' }] } };
  for (const quote of ['In caso di recesso anticipato è dovuta una penale pari a tre mensilità', 'Early termination incurs a fee equal to three monthly payments', 'La baja anticipada conlleva una penalización equivalente a tres cuotas mensuales']) {
    const c = computeCost({ ...base, findings: [{ category: 'early_termination_penalty', quote }] });
    assert.equal(c.worstCase, 468 + 117 + 49, quote);
  }
  // An exit fee already given as a figure by the server is left alone.
  const c2 = computeCost({ ...base, terms: { ...base.terms, penalty: { amount: 120 } }, findings: [{ category: 'early_termination_penalty', quote: 'tre mensilità' }] });
  assert.equal(c2.worstCase, 468 + 120 + 49);
});

test('the timeline uses the exit fee computed from monthly payments', async () => {
  const { computeCost, buildTimeline } = await import('../src/core/consequence.js');
  const ctx = { pricing: { amount: 39, period: 'month', currency: 'EUR' } };
  const findings = [{ category: 'early_termination_penalty', quote: 'una penale pari a tre mensilità' }];
  const cost = computeCost({ ctx, findings, terms: { minTerm: { months: 12, raw: '12 mesi' } } });
  const step = buildTimeline({ ctx, cost, findings }).find((s) => s.when === 'Se esci prima');
  assert.match(step.items[0], /117/);
});

test('the letter in Spanish and English, with the country\'s laws and sending method', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const es = buildLetter(c, { name: 'Lucía García' }, LETTER_KINDS.WITHDRAWAL, T0, 'es');
  assert.equal(es.lang, 'es');
  assert.ok(es.text.includes('desistimiento') && es.text.includes('Real Decreto Legislativo 1/2007') && es.text.includes('burofax'));
  assert.match(es.filename, /^desistimiento-/);
  const en = buildLetter(c, {}, LETTER_KINDS.CANCELLATION, T0, 'en');
  assert.ok(en.text.includes('[Full name]') && en.text.includes('Directive 93/13/EEC') && en.text.includes('Yours faithfully'));
  assert.match(en.filename, /^cancellation-/);
  const { letterLangFor } = await import('../src/core/letter.js');
  assert.deepEqual(['IT', 'ES', 'EU', 'UK'].map(letterLangFor), ['it', 'es', 'en', 'en']);
});

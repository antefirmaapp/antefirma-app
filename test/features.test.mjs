/**
 * Test delle quattro funzionalità aggiunte dopo il primo rilascio:
 * modello on-device, analisi speculativa, prova di cosa hai accettato,
 * kit di uscita.
 *
 *   node --test test/features.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze } from '../src/core/analyzer.js';
import { DEFAULT_SETTINGS } from '../src/core/constants.js';
import { runRules } from '../src/core/rules.js';
import { computeCost } from '../src/core/consequence.js';
import { createSnapshot, compareSnapshot, sha256, attestation } from '../src/core/proof.js';
import {
  buildCommitment, planReminders, dueReminder, missedWindow, commitmentState,
  costOfDoingNothing, portfolioSummary, COMMITMENT_STATUS, REMINDER_OFFSETS_DAYS,
} from '../src/core/commitments.js';
import { buildIcs } from '../src/core/ics.js';
import { buildLetter, suggestKind, LETTER_KINDS } from '../src/core/letter.js';
import { resolveApi, localModelStatus, buildCompactPrompt, analyzeLocally, resetSession } from '../src/core/local-llm.js';

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

async function verdictFor(settings = {}) {
  return analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false, ...settings },
    now: T0,
  });
}

// ── 1. modello on-device ────────────────────────────────────────────────────

/** Finto modello integrato, per verificare il collegamento senza un browser. */
function fakeScope(response, { fail = false, supportsSchema = true, destroyedOnce = false } = {}) {
  const calls = [];
  const sessions = { create: 0 };
  let expired = destroyedOnce;
  return {
    calls,
    sessions,
    scope: {
      LanguageModel: {
        async availability() {
          return fail ? 'unavailable' : 'available';
        },
        async create() {
          if (fail) throw new Error('modello non scaricabile');
          sessions.create += 1;
          return {
            async prompt(text, opts = {}) {
              calls.push({ text, opts });
              // Il service worker è stato sospeso fra la pre-analisi e il click:
              // la sessione muore con lui, ed è il caso più comune sul campo.
              if (expired) {
                expired = false;
                throw new Error('The model execution session has been destroyed.');
              }
              if (!supportsSchema && opts.responseConstraint) {
                throw new Error('responseConstraint not supported');
              }
              return JSON.stringify(response);
            },
            destroy() {},
          };
        },
      },
    },
  };
}

const LOCAL_ANSWER = {
  headline: 'Ti stai impegnando per due anni',
  summary: 'Abbonamento con vincolo di 24 mesi e penale di uscita.',
  clauses: [
    { category: 'auto_renewal', severity: 70, title: 'Rinnovo tacito', quote: 'si rinnova automaticamente', plain: 'riparte da solo' },
  ],
  economics: { minimumTermMonths: 24, noticeDays: 60, penaltyAmount: 120, autoRenewal: true, worstCaseTotal: 648.76 },
  mustRemember: 'Disdici entro giugno 2028',
};

test('il modello on-device viene usato quando è disponibile', async () => {
  resetSession();
  const { scope, calls } = fakeScope(LOCAL_ANSWER);
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: true },
    scope,
    now: T0,
  });

  assert.equal(v.engine.model, 'local');
  assert.equal(v.engine.llm, true);
  assert.equal(v.headline, 'Ti stai impegnando per due anni');
  assert.equal(calls.length, 1, 'deve interpellare il modello una sola volta');
  resetSession();
});

test('il prompt on-device è compatto e parte da ciò che le regole hanno già trovato', () => {
  const { findings } = runRules(CONTRACT, CTX);
  const prompt = buildCompactPrompt({
    text: CONTRACT,
    ctx: CTX,
    ruleFindings: findings,
    actionType: 'subscribe',
    profile: { money: true },
  });
  assert.ok(prompt.length < 9000, `prompt troppo lungo: ${prompt.length}`);
  assert.ok(prompt.includes('auto_renewal'), 'deve passare i finding delle regole');
  assert.ok(prompt.includes('19,99'), 'deve passare il prezzo letto dalla pagina');
});

test('se il browser non accetta lo schema, si riprova senza vincolo', async () => {
  resetSession();
  const { scope, calls } = fakeScope(LOCAL_ANSWER, { supportsSchema: false });
  const out = await analyzeLocally({ text: CONTRACT, ctx: CTX, ruleFindings: [], actionType: 'subscribe', scope });
  assert.equal(out.headline, 'Ti stai impegnando per due anni');
  assert.equal(calls.length, 2, 'primo tentativo con schema, secondo senza');
  resetSession();
});

test('senza modello integrato l’analisi prosegue con le sole regole', async () => {
  resetSession();
  const { scope } = fakeScope(null, { fail: true });
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: true },
    scope,
    now: T0,
  });
  assert.equal(v.engine.model, null);
  // Il messaggio è per una persona, non per un log: la stringa tecnica di
  // Chrome resta in `detail`, e `surfaced: false` tiene la nota fuori dalla
  // card — un modello on-device assente non è un errore su cui agire.
  assert.equal(v.engine.llmError.message, 'Modello on-device non disponibile');
  assert.equal(v.engine.llmError.surfaced, false);
  assert.ok(v.engine.llmError.detail, 'il dettaglio tecnico deve restare per la diagnostica');
  assert.equal(v.cost.worstCase, 648.76, 'il motore locale deve comunque produrre i numeri');
  resetSession();
});

test('lo stato del modello è leggibile e non esplode se manca l’API', async () => {
  const missing = await localModelStatus({});
  assert.equal(missing.supported, false);
  assert.equal(missing.status, 'unsupported');

  const { scope } = fakeScope(LOCAL_ANSWER);
  const present = await localModelStatus(scope);
  assert.equal(present.status, 'available');
  assert.ok(resolveApi(scope));
});

// ── 2. analisi speculativa ──────────────────────────────────────────────────

test('la modalità speculativa non chiama mai il modello remoto', async () => {
  const originalFetch = globalThis.fetch;
  let promptCalls = 0;
  globalThis.fetch = async () => {
    promptCalls += 1;
    throw new Error('la pre-analisi non deve uscire in rete');
  };
  try {
    const v = await analyze({
      text: CONTRACT,
      ctx: CTX,
      actionType: 'subscribe',
      settings: { ...DEFAULT_SETTINGS, useLLM: true, remoteConsentAt: '2026-01-01T00:00:00.000Z', provider: 'anthropic', apiKey: 'k', useLocalModel: false },
      mode: 'speculative',
      now: T0,
    });
    assert.equal(promptCalls, 0);
    assert.equal(v.engine.mode, 'speculative');
    assert.equal(v.engine.partial, true, 'deve dichiararsi parziale: c’è un gradino ancora da salire');
    assert.equal(v.cost.worstCase, 648.76, 'il verdetto speculativo è già utilizzabile');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('il verdetto speculativo non è parziale se non c’è nulla da raffinare', async () => {
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false },
    mode: 'speculative',
    now: T0,
  });
  assert.equal(v.engine.partial, false);
});

test('la modalità completa raffina il verdetto speculativo', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        content: [{
          text: JSON.stringify({
            headline: 'Impegno reale: 648,76 €',
            summary: 's',
            clauses: [],
            economics: { minimumTermMonths: 24, worstCaseTotal: 648.76 },
            confidence: 0.9,
          }).slice(1),
        }],
      }),
      { status: 200 }
    );
  try {
    const settings = { ...DEFAULT_SETTINGS, useLLM: true, remoteConsentAt: '2026-01-01T00:00:00.000Z', provider: 'anthropic', apiKey: 'k', useLocalModel: false };
    const spec = await analyze({ text: CONTRACT, ctx: CTX, actionType: 'subscribe', settings, mode: 'speculative', now: T0 });
    const full = await analyze({ text: CONTRACT, ctx: CTX, actionType: 'subscribe', settings, mode: 'full', now: T0 });

    assert.equal(spec.engine.model, null);
    assert.equal(full.engine.model, 'remote');
    assert.equal(full.engine.partial, false);
    assert.equal(full.headline, 'Impegno reale: 648,76 €');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── 3. prova di cosa hai accettato ──────────────────────────────────────────

test('lo snapshot fissa impronta, data e numeri del verdetto', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });

  assert.match(snap.hash, /^[0-9a-f]{64}$/);
  assert.equal(snap.hash, await sha256(snap.text));
  assert.equal(snap.at, new Date(T0).toISOString());
  assert.equal(snap.verdict.worstCase, 648.76);
  assert.ok(snap.verdict.categories.includes('auto_renewal'));
  assert.ok(snap.excerpt.length > 100);
});

test('un testo identico produce la stessa impronta, uno diverso no', async () => {
  const a = await createSnapshot({ text: CONTRACT, verdict: {}, now: T0 });
  const b = await createSnapshot({ text: CONTRACT, verdict: {}, now: T0 + 1000 });
  const c = await createSnapshot({ text: CONTRACT.replace('24 mesi', '36 mesi'), verdict: {}, now: T0 });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('il confronto dice di quanto è cambiato l’impegno, non che "i termini sono cambiati"', async () => {
  const before = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict: before, now: T0 });

  // Il fornitore raddoppia la penale e aggiunge la modifica unilaterale del prezzo.
  const after = CONTRACT
    .replace('€ 120,00', '€ 300,00')
    .concat('\n7. Il fornitore può modificare unilateralmente il prezzo del servizio.');
  const { findings } = runRules(after, CTX);
  const newVerdict = {
    ...(await analyze({ text: after, ctx: CTX, actionType: 'subscribe', settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: false }, now: T0 })),
  };

  const diff = compareSnapshot(snap, { text: after, verdict: newVerdict, newHash: await sha256(after) });

  assert.equal(diff.changed, true);
  assert.equal(diff.hashChanged, true);
  assert.equal(diff.severity, 'major');
  assert.equal(diff.costDelta, 180, 'la penale è passata da 120 a 300');
  assert.ok(diff.added.includes('price_change'));
  assert.match(diff.summary, /impegno potenziale è salito/);
  assert.ok(findings.length > 0);
});

test('condizioni invariate non generano allarmi', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });
  const diff = compareSnapshot(snap, { text: CONTRACT, verdict, newHash: snap.hash });

  assert.equal(diff.changed, false);
  assert.equal(diff.severity, 'none');
  assert.match(diff.summary, /identiche/);
});

test('l’attestazione contiene l’impronta ed è onesta sul proprio valore', async () => {
  const snap = await createSnapshot({ text: CONTRACT, verdict: await verdictFor(), now: T0 });
  const text = attestation(snap, { host: 'streampro.test' });
  assert.ok(text.includes(snap.hash));
  assert.ok(/non è una certificazione con valore legale autonomo/i.test(text));
});

// ── 4. kit di uscita ────────────────────────────────────────────────────────

test('l’impegno nasce dal verdetto con scadenze coerenti', async () => {
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

test('il piano dei promemoria copre 30, 7 e 1 giorno prima della scadenza', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const plan = planReminders(c, T0);
  assert.deepEqual(plan.map((r) => r.days), REMINDER_OFFSETS_DAYS.slice().sort((a, b) => b - a));
  const deadline = new Date(c.deadlineAt).getTime();
  for (const r of plan) {
    assert.ok(new Date(r.at).getTime() < deadline, 'un promemoria dopo la scadenza è inutile');
    assert.equal(r.fired, false);
  }
});

test('la passata quotidiana sceglie un solo promemoria, il più urgente', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const c = { ...base, reminders: planReminders(base, T0) };
  const deadline = new Date(c.deadlineAt).getTime();

  // Molto prima: niente da dire.
  assert.equal(dueReminder(c, T0), null);

  // A 20 giorni dalla scadenza è dovuto quello a 30, non ancora quello a 7.
  const twenty = deadline - 20 * 86_400_000;
  assert.equal(dueReminder(c, twenty).days, 30);

  // A due giorni dalla scadenza quello a 1 giorno non è ancora dovuto.
  assert.equal(dueReminder(c, deadline - 2 * 86_400_000).days, 7);

  // Dopo una pausa lunga del browser sarebbero dovuti tutti e tre: ne esce
  // uno solo, il più urgente. Tre notifiche di fila si disattivano, non si leggono.
  const few = deadline - 6 * 3_600_000;
  assert.equal(dueReminder(c, few).days, 1);

  // Segnati come inviati, tacciono.
  const sent = { ...c, reminders: c.reminders.map((r) => ({ ...r, fired: true })) };
  assert.equal(dueReminder(sent, few), null);

  // Un impegno disdetto non disturba più.
  assert.equal(dueReminder({ ...c, status: 'cancelled' }, few), null);
});

test('la finestra chiusa mentre il browser era spento viene comunque segnalata', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const c = { ...base, reminders: planReminders(base, T0) };
  const after = new Date(c.deadlineAt).getTime() + 5 * 86_400_000;

  // È il caso che prima produceva silenzio: nessun promemoria è più dovuto…
  assert.equal(dueReminder(c, after), null);
  // …ma l'utente deve sapere che il contratto si è rinnovato.
  assert.equal(missedWindow(c, after), true);
  // Una volta sola, però.
  assert.equal(missedWindow({ ...c, missedNotified: true }, after), false);
  assert.equal(missedWindow(c, T0), false);
});

test('chi scopre l’estensione a ridosso della scadenza viene avvisato subito e con il numero giusto', async () => {
  const base = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const late = new Date(base.deadlineAt).getTime() - 10 * 86_400_000;
  const plan = planReminders(base, late);

  // Il promemoria "mancano 30 giorni" ha una data ormai passata: nasce
  // consumato, altrimenti partirebbe dicendo una cosa falsa.
  const thirty = plan.find((r) => r.days === 30);
  assert.equal(thirty.fired, true);

  // Al suo posto ce n'è uno immediato, con i giorni reali.
  const urgente = plan.find((r) => r.kind === 'urgent');
  assert.ok(urgente, 'manca il promemoria immediato');
  assert.equal(urgente.days, 10);
  assert.equal(urgente.fired, false);

  const c = { ...base, reminders: plan };
  assert.equal(dueReminder(c, late).days, 10, 'è lui che deve partire per primo');
});

test('lo stato dice quanto manca e quanto costa non fare niente', async () => {
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

test('il riepilogo somma l’esposizione e trova la prossima scadenza', async () => {
  const a = buildCommitment({ verdict: await verdictFor(), now: T0, id: 'a' });
  const b = { ...a, id: 'b', worstCase: 100, deadlineAt: new Date(T0 + 5 * 86_400_000).toISOString() };
  const c = { ...a, id: 'c', status: 'cancelled', worstCase: 999 };

  const s = portfolioSummary([a, b, c], T0);
  assert.equal(s.count, 2, 'gli impegni disdetti non contano nell’esposizione');
  assert.equal(s.totals[0].amount, 748.76);
  assert.equal(s.next.c.id, 'b');
  assert.equal(s.urgent, 1);
});

test('il file .ics è valido e porta i promemoria dentro il calendario', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const ics = buildIcs(c, { now: T0 });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'disdetta e rinnovo');
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 3);
  assert.ok(ics.includes('TRIGGER:-P30D'));
  assert.match(ics, /DTSTART;VALUE=DATE:20280(6|7)\d{2}/);
  // Le righe non devono superare i 75 ottetti, altrimenti il file è invalido.
  for (const line of ics.split('\r\n')) {
    assert.ok(line.length <= 75, `riga troppo lunga: ${line.slice(0, 40)}…`);
  }
  // Le virgole nelle descrizioni vanno protette.
  assert.ok(!/[^\\],.*DESCRIPTION/.test(ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION')) || ''));
});

test('la lettera giusta dipende da quanto tempo è passato', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  assert.equal(suggestKind(c, T0 + 3 * 86_400_000), LETTER_KINDS.WITHDRAWAL, 'entro 14 giorni: recesso');
  assert.equal(suggestKind(c, T0 + 200 * 86_400_000), LETTER_KINDS.CANCELLATION, 'dopo: disdetta');

  const altered = { ...c, changes: [{ severity: 'major', summary: 'il prezzo è salito' }] };
  assert.equal(suggestKind(altered, T0 + 200 * 86_400_000), LETTER_KINDS.CHANGE);
});

test('la lettera di disdetta è completa e cita la norma corretta', async () => {
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

test('senza i dati dell’utente la lettera resta usabile, con i segnaposto', async () => {
  const c = buildCommitment({ verdict: await verdictFor(), now: T0 });
  const letter = buildLetter(c, {}, LETTER_KINDS.WITHDRAWAL, T0);
  assert.ok(letter.text.includes('[Nome e cognome]'));
  assert.ok(letter.text.includes('quattordici giorni'));
  assert.ok(letter.text.includes('artt. 52-59'));
});

test('la lettera di recesso per modifica richiama la clausola cambiata', async () => {
  const c = {
    ...buildCommitment({ verdict: await verdictFor(), now: T0 }),
    changes: [{ severity: 'major', summary: 'Il tuo impegno potenziale è salito da 648,76 € a 828,76 €.' }],
  };
  const letter = buildLetter(c, { name: 'Mario Rossi' }, LETTER_KINDS.CHANGE, T0 + 300 * 86_400_000);
  assert.ok(letter.text.includes('828,76'));
  assert.ok(letter.text.includes('senza penali'));
  assert.ok(letter.text.includes('art. 33 c. 2 lett. m)'));
});

test('la lettera riporta l’impronta dello snapshot come riferimento', async () => {
  const verdict = await verdictFor();
  const snap = await createSnapshot({ text: CONTRACT, verdict, now: T0 });
  const c = buildCommitment({ verdict, snapshot: snap, now: T0 });
  const letter = buildLetter(c, { name: 'Mario Rossi' }, LETTER_KINDS.CANCELLATION, T0);
  assert.ok(letter.text.includes(snap.hash.slice(0, 32)));
});

test('un impegno senza conseguenze nel tempo non produce scadenze', () => {
  const c = buildCommitment({
    verdict: { host: 'blog.test', level: { id: 'safe' }, cost: {}, findings: [] },
    now: T0,
  });
  assert.equal(c.deadlineAt, null);
  assert.equal(buildIcs(c), null);
  assert.deepEqual(planReminders(c, T0), []);
  assert.equal(commitmentState(c, T0).urgency, 'none');
});

// ── una prova senza testo non è una prova ───────────────────────────────────

test('uno snapshot senza testo si dichiara vuoto', async () => {
  const empty = await createSnapshot({ text: '', verdict: {} });
  assert.equal(empty.empty, true);
  assert.equal(empty.chars, 0);
});

test('lo snapshot di un contratto vero non è vuoto', async () => {
  const complete = await createSnapshot({ text: CONTRACT, verdict: {} });
  assert.equal(complete.empty, false);
  assert.equal(complete.hash, await sha256(complete.text));
});

test('l’impronta della stringa vuota non deve poter passare per una verifica riuscita', async () => {
  const a = await createSnapshot({ text: '', verdict: {} });
  const b = await createSnapshot({ text: '   ', verdict: {} });
  // Le due impronte coincidono: è esattamente il motivo per cui il flag serve.
  assert.equal(a.hash, b.hash);
  assert.ok(a.empty && b.empty, 'senza il flag, la verifica direbbe «✓ corrisponde»');
});

// ── consenso all'analisi remota ─────────────────────────────────────────────

test('senza consenso esplicito il testo non esce, anche con la chiave configurata', async () => {
  let called = false;
  const settings = {
    ...DEFAULT_SETTINGS,
    useLLM: true,
    provider: 'anthropic',
    apiKey: 'sk-finta',
    remoteConsentAt: null,
    useLocalModel: false,
  };
  // Se il modello remoto venisse interpellato, la fetch fallirebbe e il
  // verdetto porterebbe un llmError: è quello il segnale che cerchiamo.
  const verdict = await analyze({
    text: CONTRACT,
    ctx: { url: 'https://x.test', pricing: {}, terms: {}, form: {} },
    actionType: 'subscribe',
    settings,
  });
  assert.equal(verdict.engine.llm, false, 'il modello remoto è stato interpellato');
  assert.equal(verdict.engine.llmError, null, `errore inatteso: ${JSON.stringify(verdict.engine.llmError)}`);
  assert.ok(verdict.score > 0, 'il verdetto locale deve restare pieno');
  assert.equal(called, false);
});

test('il verdetto non è dichiarato parziale se il remoto non è utilizzabile', async () => {
  const verdict = await analyze({
    text: CONTRACT,
    ctx: { url: 'https://x.test', pricing: {}, terms: {}, form: {} },
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: true, provider: 'anthropic', apiKey: 'sk-finta', remoteConsentAt: null },
    mode: 'speculative',
  });
  assert.equal(verdict.engine.partial, false, 'promette un raffinamento che non può avvenire');
});

// ── la sessione on-device scade: si ricrea, non si annuncia ─────────────────

test('una sessione on-device scaduta viene ricreata invece che riportata', async () => {
  resetSession();
  const { scope, sessions, calls } = fakeScope(LOCAL_ANSWER, { destroyedOnce: true });
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: true },
    scope,
    now: T0,
  });
  assert.equal(sessions.create, 2, 'la sessione non è stata ricreata');
  assert.equal(calls.length, 2, `prompt inviati: ${calls.length}`);
  assert.equal(v.engine.model, 'local', 'il modello doveva rispondere al secondo tentativo');
  assert.equal(v.engine.llmError, null, 'un ritentativo riuscito non è un errore');
  resetSession();
});

test('un guasto vero del modello non viene ritentato all’infinito', async () => {
  resetSession();
  const { scope, calls } = fakeScope(LOCAL_ANSWER, { fail: false });
  // Una sessione che fallisce sempre per un motivo diverso dalla scadenza.
  scope.LanguageModel.create = async () => ({
    async prompt() { calls.push({}); throw new Error('modello in fiamme'); },
    destroy() {},
  });
  const v = await analyze({
    text: CONTRACT,
    ctx: CTX,
    actionType: 'subscribe',
    settings: { ...DEFAULT_SETTINGS, useLLM: false, useLocalModel: true },
    scope,
    now: T0,
  });
  assert.equal(calls.length, 1, `un solo tentativo atteso, fatti ${calls.length}`);
  assert.equal(v.engine.llmError.surfaced, false);
  assert.equal(v.cost.worstCase, 648.76, 'il verdetto locale resta pieno');
  resetSession();
});

/**
 * L'estrattore PDF, sui file veri.
 *
 * Qui i fallimenti sono silenziosi: un PDF letto male non dà un errore, dà una
 * stringa vuota o parole incollate — e a valle diventano zero finding, che
 * l'utente legge come «contratto pulito». Quattro difetti erano vivi da sempre
 * perché nessuno guardava il testo estratto: il kerning degli array `TJ`,
 * `/DecodeParms` che nascondeva `/Filter`, `endstream` dentro il contenuto e
 * una soglia di affidabilità tarata sulla sola prosa.
 *
 * Per questo ogni caso finisce sul motore a regole, non sull'uguaglianza fra
 * stringhe: la domanda vera non è «il testo è identico?» ma «le clausole si
 * vedono ancora?».
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPdfText } from '../src/lib/pdf-text.js';
import { runRules } from '../src/core/rules.js';
import { makePdf, tjStream, tmStream, kernedStream } from './fixtures/pdf.mjs';

/** Un contratto con dentro quattro condizioni che il motore deve riconoscere. */
const CONTRACT = [
  'CONTRATTO DI ABBONAMENTO N. 2026/00841 - TelcoUno S.p.A., P.IVA 01234567890',
  'Art. 1 (Durata) La durata minima e\' di 24 mesi dalla data di attivazione.',
  'Art. 2 (Rinnovo) Alla scadenza il contratto si rinnova automaticamente per 12 mesi.',
  'Art. 3 (Recesso) La disdetta va comunicata almeno 30 giorni prima della scadenza.',
  'Art. 4 (Penale) In caso di recesso anticipato e\' dovuta una penale di 179,40 euro.',
];

const CATEGORIES = ['minimum_term', 'auto_renewal', 'notice_period', 'early_termination_penalty'];

const categories = (text) => new Set(runRules(text).findings.map((f) => f.category));

/** Le quattro clausole del contratto sono tutte visibili al motore. */
function assertClausesVisible(text, label) {
  const found = categories(text);
  for (const cat of CATEGORIES) {
    assert.ok(found.has(cat), `${label}: il motore non vede più "${cat}" — ${JSON.stringify(text.slice(0, 120))}`);
  }
}

// ── il caso nominale ────────────────────────────────────────────────────────

test('un PDF compresso con Tj e Td restituisce il testo, riga per riga', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.equal(r.streams, 1);
  assert.equal(r.decoded, 1);
  assert.equal(r.pages, 1);
  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.equal(r.text.split('\n').length, CONTRACT.length, 'ogni Td deve valere un a capo');
  assertClausesVisible(r.text, 'Tj+Td');
});

test('un testo estratto bene si dichiara affidabile e non allega note', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.equal(r.reliable, true, `dichiarato inaffidabile: ${r.note}`);
  assert.equal(r.note, null);
});

// ── i quattro difetti ───────────────────────────────────────────────────────

/**
 * Il layout dominante di Word, LibreOffice e InDesign: gli spazi non sono
 * caratteri, sono offset negativi fra i letterali dell'array. Prima della
 * correzione questo PDF dava "Ilcanonee'di19,99euro", cioè zero finding perché
 * ogni `\b` delle regole smetteva di agganciare.
 */
test('gli array TJ con kerning conservano gli spazi fra le parole', async () => {
  const r = await extractPdfText(makePdf(kernedStream(CONTRACT)));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.ok(!/[a-z]{25,}/.test(r.text), `parole incollate: ${JSON.stringify(r.text.slice(0, 160))}`);
  assert.equal(r.reliable, true);
  assertClausesVisible(r.text, 'TJ con kerning');
});

test('il kerning fine resta kerning e non diventa uno spazio', async () => {
  // -40 millesimi di em è una crenatura fra lettere, non uno stacco fra parole.
  const r = await extractPdfText(makePdf(kernedStream(['penale di 179,40 euro'], -40)));

  assert.match(r.text, /penaledi179,40euro/, 'un offset minimo non deve generare spazi');
});

/**
 * `<< /Filter /FlateDecode /DecodeParms << … >> /Length N >>`: risalendo con
 * lastIndexOf('<<') si finiva nel dizionario annidato, /Filter spariva, il
 * flusso compresso veniva letto come testo in chiaro e buttato via.
 */
test('/DecodeParms non nasconde il filtro del flusso compresso', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { decodeParms: true }));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.equal(r.decoded, 1, 'lo stream va contato come decodificato solo se lo è davvero');
  assertClausesVisible(r.text, '/DecodeParms');
});

/**
 * `/Length` è autorevole, `endstream` no: un contratto che nomina la parola
 * (o un font, o un JPEG che la contiene per caso) troncava lo stream a metà.
 */
test('la parola endstream dentro il testo non tronca lo stream', async () => {
  const lines = ['Nota tecnica: la parola endstream compare in questo paragrafo.', ...CONTRACT];
  const r = await extractPdfText(makePdf(tjStream(lines), { compress: false }));

  assert.match(r.text, /penale di 179,40 euro/, 'il testo dopo "endstream" è stato buttato');
  assertClausesVisible(r.text, 'endstream nel testo');
});

test('senza /Length il confine dello stream resta endstream', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { compress: false, length: false }));

  assert.match(r.text, /penale di 179,40 euro/);
  assertClausesVisible(r.text, 'senza /Length');
});

/**
 * La vecchia metrica contava solo lettere e spazi: cifre e punteggiatura
 * valevano zero. Un contratto in prosa misurava 0,99, ma bastava allegare il
 * piano di fatturazione — che è mezzo contratto reale — per scendere sotto la
 * soglia di 0,5 e far dichiarare inaffidabile un PDF estratto alla perfezione.
 * Il testo qui sotto misura 0,42 con la metrica vecchia e 1,00 con la nuova.
 */
test('un contratto con allegato tariffario resta affidabile', async () => {
  const rate = [];
  for (let i = 1; i <= 14; i += 1) {
    rate.push(`${String(i).padStart(2, '0')} ${String((i % 12) + 1).padStart(2, '0')}/0${(i % 9) + 1}/2026 29,90 6,58 36,48 - cod. 4471-${1000 + i}`);
  }
  const document = [
    ...CONTRACT,
    'ALLEGATO B - Piano di fatturazione 2026/2027 (art. 2.1)',
    'Rata Scadenza Canone IVA 22% Totale',
    ...rate,
    'P.IVA 01234567890 - IBAN IT60X0542811101000000123456 - REA MI-1234567',
  ];
  const r = await extractPdfText(makePdf(tjStream(document)));

  assert.match(r.text, /IBAN IT60X0542811101000000123456/);
  assert.equal(r.reliable, true, `un allegato di importi ha reso "inaffidabile" un PDF estratto bene: ${r.note}`);
  assertClausesVisible(r.text, 'contratto con tariffario');
});

test('un testo di soli glifi grezzi si dichiara inaffidabile', async () => {
  // Font senza ToUnicode: quello che esce sono indici di glifo, non lettere.
  let glifi = '';
  for (let i = 0; i < 400; i += 1) glifi += String.fromCharCode(1 + ((i * 37) % 160));
  const r = await extractPdfText(makePdf(tjStream([glifi])));

  assert.equal(r.reliable, false, 'la spazzatura è passata per testo buono');
  assert.match(r.note, /verificalo/);
});

// ── varianti di impaginazione e di codifica ─────────────────────────────────

test('un PDF impaginato con Tm invece che con Td non finisce su una riga sola', async () => {
  const r = await extractPdfText(makePdf(tmStream(CONTRACT)));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.ok(r.text.includes('\n'), 'ogni Tm riposiziona: deve valere un a capo');
  assertClausesVisible(r.text, 'Tm');
});

test('uno stream non compresso viene letto come uno compresso', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { compress: false }));

  assert.equal(r.decoded, 1);
  assert.match(r.text, /durata minima e' di 24 mesi/);
  assertClausesVisible(r.text, 'stream in chiaro');
});

// ── i casi in cui deve arrendersi, dicendolo ────────────────────────────────

/**
 * Un PDF cifrato non si legge: l'unica risposta onesta è fermarsi. Il
 * pannello mostra il messaggio e invita a incollare il testo a mano; quello
 * che non deve succedere è restituire i byte cifrati come se fossero testo.
 */
test('un PDF cifrato si ferma invece di restituire spazzatura', async () => {
  await assert.rejects(
    () => extractPdfText(makePdf(tjStream(CONTRACT), { encrypt: true })),
    /cifratura/i
  );
});

test('un file che non è un PDF viene rifiutato subito', async () => {
  const buf = Buffer.from('Questo è un contratto in testo semplice, con penale e rinnovo automatico.', 'utf8');
  await assert.rejects(
    () => extractPdfText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    /non sembra un PDF/i
  );
});

test('un PDF senza testo estraibile lo dichiara invece di fingere', async () => {
  // Una scansione: solo grafica, nessun operatore di testo.
  const r = await extractPdfText(makePdf('q 1 0 0 RG 56 56 480 720 re S Q\n'));

  assert.equal(r.text, '');
  assert.equal(r.reliable, false);
  assert.match(r.note, /scansione/i);
});

test('le immagini incorporate non finiscono nel testo', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.ok(!/�/.test(r.text));
  assert.ok(!r.text.includes('FlateDecode'), 'i dizionari degli oggetti non sono testo del contratto');
});

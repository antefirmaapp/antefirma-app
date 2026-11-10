/**
 * The PDF extractor, on real files.
 *
 * Failures here are silent: a badly read PDF gives no error, it gives an empty
 * string or glued words — which downstream become zero findings, read by the
 * user as "clean contract". Four defects had always been alive because nobody
 * looked at the extracted text: kerning in `TJ` arrays, `/DecodeParms` hiding
 * `/Filter`, `endstream` inside the content, and a reliability threshold tuned
 * on prose alone.
 *
 * That is why every case checks what matters, not string equality: the real
 * question is not "is the text identical?" but "can the clauses still be
 * seen?".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPdfText } from '../src/lib/pdf-text.js';
import { makePdf, tjStream, tmStream, kernedStream } from './fixtures/pdf.mjs';

/** A contract with four conditions the engine must recognise. */
const CONTRACT = [
  'CONTRATTO DI ABBONAMENTO N. 2026/00841 - TelcoUno S.p.A., P.IVA 01234567890',
  'Art. 1 (Durata) La durata minima e\' di 24 mesi dalla data di attivazione.',
  'Art. 2 (Rinnovo) Alla scadenza il contratto si rinnova automaticamente per 12 mesi.',
  'Art. 3 (Recesso) La disdetta va comunicata almeno 30 giorni prima della scadenza.',
  'Art. 4 (Penale) In caso di recesso anticipato e\' dovuta una penale di 179,40 euro.',
];

/**
 * The four conditions that must reach the server intact. Without the rule
 * engine the question is no longer "do you recognise them?", but "are they in
 * the text, readable?": recognition is the server's job, readability is ours.
 */
const KEY_PHRASES = ['durata minima', 'si rinnova automaticamente', '30 giorni prima della scadenza', 'penale di 179,40 euro'];

const flat = (text) => text.replace(/\s+/g, ' ').replace(/e'/g, 'e\'');

/** The contract's four clauses can be read in the extracted text. */
function assertClausesVisible(text, label) {
  const t = flat(text);
  for (const phrase of KEY_PHRASES) {
    assert.ok(t.includes(phrase), `${label}: nel testo non si legge più «${phrase}» — ${JSON.stringify(text.slice(0, 120))}`);
  }
}

// ── il caso nominale ────────────────────────────────────────────────────────

test('a compressed PDF with Tj and Td returns the text, line by line', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.equal(r.streams, 1);
  assert.equal(r.decoded, 1);
  assert.equal(r.pages, 1);
  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.equal(r.text.split('\n').length, CONTRACT.length, 'ogni Td deve valere un a capo');
  assertClausesVisible(r.text, 'Tj+Td');
});

test('well-extracted text declares itself reliable and attaches no notes', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.equal(r.reliable, true, `dichiarato inaffidabile: ${r.note}`);
  assert.equal(r.note, null);
});

// ── i quattro difetti ───────────────────────────────────────────────────────

/**
 * The dominant layout of Word, LibreOffice and InDesign: spaces are not
 * characters, they are negative offsets between the array's literals. Before
 * the fix this PDF gave "Ilcanonee'di19,99euro", i.e. zero findings because
 * every `\b` of the rules stopped matching.
 */
test('TJ arrays with kerning keep the spaces between words', async () => {
  const r = await extractPdfText(makePdf(kernedStream(CONTRACT)));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.ok(!/[a-z]{25,}/.test(r.text), `parole incollate: ${JSON.stringify(r.text.slice(0, 160))}`);
  assert.equal(r.reliable, true);
  assertClausesVisible(r.text, 'TJ con kerning');
});

test('fine kerning stays kerning and doesn\'t become a space', async () => {
  // -40 thousandths of an em is kerning between letters, not a gap between words.
  const r = await extractPdfText(makePdf(kernedStream(['penale di 179,40 euro'], -40)));

  assert.match(r.text, /penaledi179,40euro/, 'un offset minimo non deve generare spazi');
});

/**
 * `<< /Filter /FlateDecode /DecodeParms << … >> /Length N >>`: walking back
 * with lastIndexOf('<<') ended in the nested dictionary, /Filter disappeared,
 * the compressed stream was read as plain text and thrown away.
 */
test('/DecodeParms doesn\'t hide the compressed stream\'s filter', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { decodeParms: true }));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.equal(r.decoded, 1, 'lo stream va contato come decodificato solo se lo è davvero');
  assertClausesVisible(r.text, '/DecodeParms');
});

/**
 * `/Length` is authoritative, `endstream` isn't: a contract naming the word (or
 * a font, or a JPEG containing it by chance) cut the stream in half.
 */
test('the word endstream inside the text doesn\'t truncate the stream', async () => {
  const lines = ['Nota tecnica: la parola endstream compare in questo paragrafo.', ...CONTRACT];
  const r = await extractPdfText(makePdf(tjStream(lines), { compress: false }));

  assert.match(r.text, /penale di 179,40 euro/, 'il testo dopo "endstream" è stato buttato');
  assertClausesVisible(r.text, 'endstream nel testo');
});

test('without /Length the stream boundary stays endstream', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { compress: false, length: false }));

  assert.match(r.text, /penale di 179,40 euro/);
  assertClausesVisible(r.text, 'senza /Length');
});

/**
 * The old metric counted only letters and spaces: digits and punctuation were
 * worth zero. A prose contract measured 0.99, but attaching the billing plan —
 * half a real contract — was enough to drop below the 0.5 threshold and declare
 * a perfectly extracted PDF unreliable. The text below measures 0.42 with the
 * old metric and 1.00 with the new one.
 */
test('a contract with a price-list annex stays reliable', async () => {
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

test('text made only of raw glyphs declares itself unreliable', async () => {
  // Font without ToUnicode: what comes out are glyph indexes, not letters.
  let glifi = '';
  for (let i = 0; i < 400; i += 1) glifi += String.fromCharCode(1 + ((i * 37) % 160));
  const r = await extractPdfText(makePdf(tjStream([glifi])));

  assert.equal(r.reliable, false, 'la spazzatura è passata per testo buono');
  assert.match(r.note, /verificalo/);
});

// ── layout and encoding variants ────────────────────────────────────────────

test('a PDF laid out with Tm instead of Td doesn\'t end up on a single line', async () => {
  const r = await extractPdfText(makePdf(tmStream(CONTRACT)));

  assert.match(r.text, /durata minima e' di 24 mesi/);
  assert.ok(r.text.includes('\n'), 'ogni Tm riposiziona: deve valere un a capo');
  assertClausesVisible(r.text, 'Tm');
});

test('an uncompressed stream is read like a compressed one', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT), { compress: false }));

  assert.equal(r.decoded, 1);
  assert.match(r.text, /durata minima e' di 24 mesi/);
  assertClausesVisible(r.text, 'stream in chiaro');
});

// ── the cases where it must give up, saying so ──────────────────────────────

/**
 * An encrypted PDF can't be read: the only honest answer is to stop. The panel
 * shows the message and asks to paste the text by hand; what must not happen is
 * returning the encrypted bytes as if they were text.
 */
test('an encrypted PDF stops instead of returning garbage', async () => {
  await assert.rejects(
    () => extractPdfText(makePdf(tjStream(CONTRACT), { encrypt: true })),
    /cifratura/i
  );
});

test('a file that isn\'t a PDF is refused at once', async () => {
  const buf = Buffer.from('Questo è un contratto in testo semplice, con penale e rinnovo automatico.', 'utf8');
  await assert.rejects(
    () => extractPdfText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    /non sembra un PDF/i
  );
});

test('a PDF without extractable text says so instead of pretending', async () => {
  // A scan: graphics only, no text operator.
  const r = await extractPdfText(makePdf('q 1 0 0 RG 56 56 480 720 re S Q\n'));

  assert.equal(r.text, '');
  assert.equal(r.reliable, false);
  assert.match(r.note, /scansione/i);
});

test('embedded images don\'t end up in the text', async () => {
  const r = await extractPdfText(makePdf(tjStream(CONTRACT)));

  assert.ok(!/�/.test(r.text));
  assert.ok(!r.text.includes('FlateDecode'), 'i dizionari degli oggetti non sono testo del contratto');
});

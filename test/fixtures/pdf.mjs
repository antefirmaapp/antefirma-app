/**
 * Generatore di PDF minimi, senza dipendenze esterne.
 *
 * Serve a testare l'estrattore su file veri e non su stringhe finte: i quattro
 * difetti che hanno motivato questi test (kerning, /DecodeParms, /Length,
 * soglia di affidabilità) vivono tutti nel confine fra byte e testo, e una
 * fixture che salti la compressione o l'impaginazione degli oggetti non li
 * riprodurrebbe. Catalog, pages, page e trailer sono fissi: l'unica variabile
 * è il content stream, che è l'unica cosa che l'estrattore legge davvero.
 */

import { deflateSync } from 'node:zlib';

/**
 * @param {string} content        Content stream (operatori PDF, latin1).
 * @param {object} [opts]
 * @param {boolean} [opts.compress=true]   Comprime con FlateDecode.
 * @param {boolean} [opts.decodeParms]     Aggiunge /DecodeParms << … >> al dizionario.
 * @param {boolean} [opts.length=true]     Dichiara /Length (false = solo `endstream` come confine).
 * @param {boolean} [opts.encrypt]         Aggiunge /Encrypt al trailer.
 * @returns {ArrayBuffer}
 */
export function makePdf(content, opts = {}) {
  const { compress = true, decodeParms = false, length = true, encrypt = false } = opts;
  const data = compress ? deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');

  const dict = [
    '<<',
    compress ? ' /Filter /FlateDecode' : '',
    decodeParms ? ' /DecodeParms << /Predictor 1 /Columns 1 >>' : '',
    length ? ` /Length ${data.length}` : '',
    ' >>',
  ].join('');

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R'
      + ' /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // 4 0 obj: il content stream, montato a parte perché è binario
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let at = parts[0].length;
  for (let n = 1; n <= objs.length; n += 1) {
    const head = objs[n - 1] === null
      ? Buffer.concat([Buffer.from(`${n} 0 obj\n${dict}\nstream\n`, 'latin1'), data,
        Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${n} 0 obj\n${objs[n - 1]}\nendobj\n`, 'latin1');
    offsets.push(at);
    parts.push(head);
    at += head.length;
  }

  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(
    `${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R`
    + `${encrypt ? ' /Encrypt 6 0 R' : ''} >>\nstartxref\n${at}\n%%EOF\n`,
    'latin1'
  ));

  const pdf = Buffer.concat(parts);
  return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
}

/** Content stream con `Tj`: una riga di testo per ogni voce. */
export function tjStream(lines) {
  const body = lines
    .map((l, i) => `${i === 0 ? '' : '0 -16 Td\n'}(${escapeLiteral(l)}) Tj\n`)
    .join('');
  return `BT\n/F1 11 Tf\n56 780 Td\n${body}ET\n`;
}

/** Come `tjStream`, ma posiziona con `Tm` invece che con `Td` (stile InDesign). */
export function tmStream(lines) {
  const body = lines
    .map((l, i) => `1 0 0 1 56 ${780 - i * 16} Tm\n(${escapeLiteral(l)}) Tj\n`)
    .join('');
  return `BT\n/F1 11 Tf\n${body}ET\n`;
}

/**
 * Content stream con array `TJ`: ogni spazio diventa un offset di kerning.
 * È il modo in cui Word, LibreOffice e InDesign scrivono il testo giustificato.
 */
export function kernedStream(lines, gap = -278) {
  const body = lines
    .map((l, i) => {
      const parts = l.split(' ').map((w) => `(${escapeLiteral(w)})`).join(`${gap}`);
      return `${i === 0 ? '' : '0 -16 Td\n'}[${parts}] TJ\n`;
    })
    .join('');
  return `BT\n/F1 11 Tf\n56 780 Td\n${body}ET\n`;
}

function escapeLiteral(s) {
  return s.replace(/([\\()])/g, '\\$1');
}

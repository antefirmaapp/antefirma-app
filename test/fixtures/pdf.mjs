/**
 * A generator of minimal PDFs, with no external dependencies.
 *
 * It tests the extractor on real files, not fake strings: the four defects that
 * prompted these tests (kerning, /DecodeParms, /Length, reliability threshold)
 * all live at the boundary between bytes and text, and a fixture skipping
 * compression or object layout wouldn't reproduce them. Catalog, pages, page
 * and trailer are fixed: the only variable is the content stream, the only
 * thing the extractor really reads.
 */

import { deflateSync } from 'node:zlib';

/**
 * @param {string} content        Content stream (PDF operators, latin1).
 * @param {object} [opts]
 * @param {boolean} [opts.compress=true]   Compresses with FlateDecode.
 * @param {boolean} [opts.decodeParms]     Adds /DecodeParms << … >> to the dictionary.
 * @param {boolean} [opts.length=true]     Declares /Length (false = only `endstream` as the boundary).
 * @param {boolean} [opts.encrypt]         Adds /Encrypt to the trailer.
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
    null, // 4 0 obj: the content stream, assembled separately because it is binary
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

/** Content stream with `Tj`: one line of text per item. */
export function tjStream(lines) {
  const body = lines
    .map((l, i) => `${i === 0 ? '' : '0 -16 Td\n'}(${escapeLiteral(l)}) Tj\n`)
    .join('');
  return `BT\n/F1 11 Tf\n56 780 Td\n${body}ET\n`;
}

/** Like `tjStream`, but positions with `Tm` instead of `Td` (InDesign style). */
export function tmStream(lines) {
  const body = lines
    .map((l, i) => `1 0 0 1 56 ${780 - i * 16} Tm\n(${escapeLiteral(l)}) Tj\n`)
    .join('');
  return `BT\n/F1 11 Tf\n${body}ET\n`;
}

/**
 * Content stream with a `TJ` array: every space becomes a kerning offset.
 * That is how Word, LibreOffice and InDesign write justified text.
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

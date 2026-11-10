/**
 * PDF text extractor, with no external dependencies.
 *
 * Manifest V3 forbids loading remote code, so a library like pdf.js would have
 * to be bundled into the extension. Much less is enough here: the contracts that
 * matter are text PDFs, not scans.
 *
 * What it does: finds the content streams, inflates them with
 * DecompressionStream (FlateDecode is zlib) and reads the text operators (Tj, TJ, ', ").
 * What it does NOT do: OCR of scans, fonts with exotic encodings without
 * ToUnicode, filters other than Flate. In those cases it returns little or
 * nothing and says so, so the user can paste the text by hand.
 */

import { t } from '../i18n/index.js';

const LATIN = new TextDecoder('latin1');

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{text: string, pages: number, streams: number, decoded: number, reliable: boolean, note: string|null}>}
 */
export async function extractPdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  const raw = LATIN.decode(bytes);

  if (!raw.startsWith('%PDF-') && !raw.slice(0, 1024).includes('%PDF-')) {
    throw new Error(t('Il file non sembra un PDF.'));
  }
  if (/\/Encrypt\b/.test(raw)) {
    throw new Error(t('PDF protetto da cifratura: non riesco a leggerne il contenuto.'));
  }

  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;
  const streams = findStreams(raw, bytes);

  let decodedCount = 0;
  const chunks = [];

  for (const s of streams) {
    let data = bytes.subarray(s.start, s.end);

    if (s.flate) {
      const inflated = await inflate(data);
      if (!inflated) continue;
      data = inflated;
      decodedCount += 1;
    } else if (s.filter && s.filter !== 'none') {
      continue; // filtro non supportato (DCT, CCITT, LZW…)
    } else {
      decodedCount += 1;
    }

    const content = LATIN.decode(data);
    if (!/\b(?:Tj|TJ|Td|TD|BT)\b/.test(content)) continue;
    const text = readTextOperators(content);
    if (text.trim()) chunks.push(text);
  }

  const text = normalizeExtracted(chunks.join('\n'));
  const reliable = text.length > 200 && plausibleRatio(text) > 0.90;

  return {
    text,
    pages,
    streams: streams.length,
    decoded: decodedCount,
    reliable,
    note: reliable
      ? null
      : text.length === 0
        ? t('Nessun testo estraibile: probabilmente è una scansione. Incolla il testo manualmente.')
        : t('Il testo estratto sembra parziale o codificato in modo non standard: verificalo prima di fidarti dell’analisi.'),
  };
}

/** Finds the `stream … endstream` blocks and the filter declared in the dictionary. */
function findStreams(raw, bytes) {
  const out = [];
  // `\b` avoids matching the word again inside `endstream`.
  const re = /\bstream\r?\n?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;

    // The object's dictionary precedes the `stream` keyword.
    const dictStart = findDictStart(raw, m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : '';

    const { end, after } = findStreamEnd(raw, bytes, start, dict);
    if (end < 0) continue;
    re.lastIndex = after;

    const flate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dict);
    const anyFilter = /\/Filter\s*(?:\[\s*)?\/(\w+)/.exec(dict);

    // Images and fonts contain no useful text.
    if (/\/Subtype\s*\/(Image|Type1C|TrueType|CIDFontType\dC)/.test(dict)) continue;

    out.push({
      start,
      end,
      flate,
      filter: flate ? 'flate' : anyFilter ? anyFilter[1] : 'none',
    });
  }
  return out;
}

/**
 * Walks back to the `<<` opening the stream's dictionary, balancing brackets.
 *
 * A `lastIndexOf('<<')` picks the *nested* dictionary when there is
 * `<< /Filter /FlateDecode /DecodeParms << /Predictor 1 >> /Length N >>`, the
 * form almost every generator writes: /Filter ends up outside the slice
 * examined, `flate` becomes false and the compressed stream is read as plain
 * text — that is, silently discarded.
 */
function findDictStart(raw, streamIdx) {
  const floor = Math.max(1, streamIdx - 20000);
  let depth = 0;
  for (let i = streamIdx - 1; i >= floor; i -= 1) {
    if (raw[i] === '>' && raw[i - 1] === '>') {
      depth += 1;
      i -= 1;
    } else if (raw[i] === '<' && raw[i - 1] === '<') {
      depth -= 1;
      if (depth <= 0) return i - 1;
      i -= 1;
    }
  }
  return -1;
}

/**
 * The stream's end. `/Length` is authoritative and `endstream` isn't: the word
 * can appear inside the content (a contract naming it, a font, a JPEG), and
 * searching for it blindly cuts the text in half without telling anyone.
 */
function findStreamEnd(raw, bytes, start, dict) {
  // Beware of `/Length 7 0 R`: it is an indirect reference, not a length.
  const declared = /\/Length\s+(\d+)(?!\s*\d+\s+R)/.exec(dict);
  if (declared) {
    const end = start + Number(declared[1]);
    if (end <= raw.length && /^[\r\n \t]*endstream/.test(raw.slice(end, end + 16))) {
      return { end, after: raw.indexOf('endstream', end) + 9 };
    }
  }

  const idx = raw.indexOf('endstream', start);
  if (idx < 0) return { end: -1, after: start };
  let end = idx;
  while (end > start && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end -= 1;
  return { end, after: idx + 9 };
}

async function inflate(data) {
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      /* prova il formato successivo */
    }
  }
  return null;
}

/**
 * Kerning threshold beyond which a shift is a space, in thousandths of an em.
 * It is the value pdf.js uses: below are corrections between letters (kerning,
 * justification), above is a new word.
 */
const WORD_GAP = -120;

/**
 * Reads the text operators of a PDF content stream.
 * A mini-parser: enough for Tj/TJ/'/" and line breaks.
 */
function readTextOperators(content) {
  const out = [];
  let i = 0;
  const len = content.length;
  let pendingSpace = false;
  let arrayDepth = 0;

  while (i < len) {
    const ch = content[i];

    if (ch === '[') { arrayDepth += 1; i += 1; continue; }
    if (ch === ']') { arrayDepth = Math.max(0, arrayDepth - 1); i += 1; continue; }

    // Inside a `TJ` array the numbers between literals *are* the spaces: that is
    // how Word, LibreOffice and InDesign lay out justified text. Ignoring them
    // glues words together and the text stops being readable.
    if (arrayDepth > 0 && (ch === '-' || ch === '.' || (ch >= '0' && ch <= '9'))) {
      const num = /^[-+]?\d*\.?\d+/.exec(content.slice(i, i + 24));
      if (num) {
        if (Number.parseFloat(num[0]) <= WORD_GAP) out.push(' ');
        i += num[0].length;
        continue;
      }
    }

    if (ch === '(') {
      const { value, next } = readLiteralString(content, i);
      out.push(value);
      i = next;
      continue;
    }

    if (ch === '<' && content[i + 1] !== '<') {
      const close = content.indexOf('>', i);
      if (close < 0) break;
      out.push(hexToString(content.slice(i + 1, close)));
      i = close + 1;
      continue;
    }

    // Operators implying a line break or a space.
    if (/[A-Za-z'"*]/.test(ch)) {
      const opMatch = /^(T[dDJjm*wLcz]|'|"|BT|ET|Tf|TD)/.exec(content.slice(i, i + 3));
      if (opMatch) {
        const op = opMatch[1];
        // `Tm` repositions like `Td`: whoever lays out with the matrix (InDesign,
        // many generators) would otherwise deliver the page on a single line.
        if (op === 'Td' || op === 'TD' || op === 'Tm' || op === 'T*' || op === 'ET') out.push('\n');
        else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') pendingSpace = true;
        i += op.length;
        if (pendingSpace) {
          out.push(' ');
          pendingSpace = false;
        }
        continue;
      }
    }

    i += 1;
  }

  return out.join('');
}

function readLiteralString(content, start) {
  let i = start + 1;
  let depth = 1;
  let out = '';
  while (i < content.length) {
    const c = content[i];
    if (c === '\\') {
      const next = content[i + 1];
      const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
      if (octal) {
        out += String.fromCharCode(Number.parseInt(octal[0], 8));
        i += 1 + octal[0].length;
        continue;
      }
      const map = { n: '\n', r: '\n', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' };
      if (next === '\n' || next === '\r') {
        i += 2;
        continue;
      }
      out += map[next] ?? next ?? '';
      i += 2;
      continue;
    }
    if (c === '(') { depth += 1; out += c; i += 1; continue; }
    if (c === ')') {
      depth -= 1;
      if (depth === 0) return { value: out, next: i + 1 };
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return { value: out, next: i };
}

function hexToString(hex) {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  let out = '';
  // I testi esadecimali nei PDF sono spesso UTF-16BE.
  const isUtf16 = clean.length % 4 === 0 && /^(00|fe|d[89ab])/i.test(clean.slice(0, 2));
  const step = isUtf16 ? 4 : 2;
  for (let i = 0; i + step <= clean.length; i += step) {
    const code = Number.parseInt(clean.slice(i, i + step), 16);
    if (code === 0) continue;
    out += String.fromCharCode(code);
  }
  return out;
}

function normalizeExtracted(text) {
  return text
    .replace(/\x00/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Rejoin words hyphenated at the end of a line.
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .trim();
}

/**
 * Characters an Italian document can contain: letters (accented ones
 * included), digits, spacing and common punctuation.
 *
 * It also includes bullets and ligatures (ﬁ, ﬂ), which come out of a well
 * extracted PDF all the time. It deliberately does *not* include control
 * characters, stray symbols (¨ ¤ ± ¬ ¶) and letters outside the Latin
 * alphabet: they are exactly what a failed extraction produces, i.e. a font
 * without ToUnicode read as latin1 (`Ã¨`, `â¬`) or raw glyph indexes
 * (`\x01\x02`).
 */
const PLAUSIBLE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:!?'"()[\]{}«»“”‘’%&@#*+=/\\<>_°§©®™•·…€$£–—ﬀ-ﬆ-]/g;

/**
 * Share of plausible characters: if it is low, extraction went wrong.
 *
 * The previous metric counted only letters and spaces, so every digit and
 * punctuation mark was worth zero. On a formatted contract — numbered articles,
 * amounts, VAT, VAT numbers — it measured 0.70 (a cost table even less) against
 * 0.99 for prose: a perfectly extracted document came within a whisker of the
 * 0.5 threshold, and a price-list annex was enough to declare it unreliable.
 * Counting digits and punctuation too makes the measure insensitive to
 * formatting and sensitive only to mojibake, which is what we really want to
 * detect. Measured: prose, an amount table and a bulleted list all score 1.00;
 * mojibake text 0.88; raw glyphs 0.60. The threshold is 0.90, in the gap
 * between the two populations.
 */
function plausibleRatio(text) {
  const sample = text.slice(0, 4000);
  if (!sample.length) return 0;
  return (sample.match(PLAUSIBLE) || []).length / sample.length;
}

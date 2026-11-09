/**
 * Estrattore di testo da PDF, senza dipendenze esterne.
 *
 * Manifest V3 vieta di caricare codice remoto, quindi una libreria come pdf.js
 * andrebbe impacchettata nell'estensione. Per l'MVP basta molto meno: i
 * contratti che interessano qui sono PDF testuali, non scansioni.
 *
 * Cosa fa: individua i content stream, li decomprime con DecompressionStream
 * (FlateDecode è zlib) e legge gli operatori di testo (Tj, TJ, ', ").
 * Cosa NON fa: OCR di scansioni, font con codifiche esotiche senza ToUnicode,
 * filtri diversi da Flate. In quei casi restituisce poco o nulla e lo dichiara,
 * così l'utente può incollare il testo a mano.
 */

const LATIN = new TextDecoder('latin1');

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{text: string, pages: number, streams: number, decoded: number, reliable: boolean, note: string|null}>}
 */
export async function extractPdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  const raw = LATIN.decode(bytes);

  if (!raw.startsWith('%PDF-') && !raw.slice(0, 1024).includes('%PDF-')) {
    throw new Error('Il file non sembra un PDF.');
  }
  if (/\/Encrypt\b/.test(raw)) {
    throw new Error('PDF protetto da cifratura: non riesco a leggerne il contenuto.');
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
        ? 'Nessun testo estraibile: probabilmente è una scansione. Incolla il testo manualmente.'
        : 'Il testo estratto sembra parziale o codificato in modo non standard: verificalo prima di fidarti dell’analisi.',
  };
}

/** Individua i blocchi `stream … endstream` e il filtro dichiarato nel dizionario. */
function findStreams(raw, bytes) {
  const out = [];
  // `\b` evita di riagganciare la parola dentro `endstream`.
  const re = /\bstream\r?\n?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;

    // Il dizionario dell'oggetto precede la parola chiave `stream`.
    const dictStart = findDictStart(raw, m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : '';

    const { end, after } = findStreamEnd(raw, bytes, start, dict);
    if (end < 0) continue;
    re.lastIndex = after;

    const flate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dict);
    const anyFilter = /\/Filter\s*(?:\[\s*)?\/(\w+)/.exec(dict);

    // Immagini e font non contengono testo utile.
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
 * Risale al `<<` che apre il dizionario dello stream, bilanciando le parentesi.
 *
 * Un `lastIndexOf('<<')` prende il dizionario *annidato* quando c'è
 * `<< /Filter /FlateDecode /DecodeParms << /Predictor 1 >> /Length N >>`, cioè
 * la forma che scrivono quasi tutti i generatori: /Filter finisce fuori dalla
 * fetta esaminata, `flate` diventa false e il flusso compresso viene letto come
 * testo in chiaro — cioè scartato, in silenzio.
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
 * Confine dello stream. `/Length` è autorevole e `endstream` no: la parola può
 * comparire dentro il contenuto (un contratto che la nomina, un font, un JPEG),
 * e cercarla a occhio tronca il testo a metà senza dirlo a nessuno.
 */
function findStreamEnd(raw, bytes, start, dict) {
  // Attenzione a `/Length 7 0 R`: è un riferimento indiretto, non una lunghezza.
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
 * Soglia di kerning oltre la quale lo spostamento è uno spazio, in millesimi
 * di em. È il valore che usa pdf.js: sotto stanno le correzioni fra lettere
 * (crenatura, giustificazione), sopra c'è una parola nuova.
 */
const WORD_GAP = -120;

/**
 * Legge gli operatori di testo di un content stream PDF.
 * Un mini-parser: sufficiente per Tj/TJ/'/" e per i salti di riga.
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

    // Dentro un array `TJ` i numeri fra i letterali *sono* gli spazi: è così
    // che Word, LibreOffice e InDesign impaginano il testo giustificato.
    // Ignorarli incolla le parole e ogni `\b` delle regole smette di agganciare.
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

    // Operatori che implicano un a capo o uno spazio.
    if (/[A-Za-z'"*]/.test(ch)) {
      const opMatch = /^(T[dDJjm*wLcz]|'|"|BT|ET|Tf|TD)/.exec(content.slice(i, i + 3));
      if (opMatch) {
        const op = opMatch[1];
        // `Tm` riposiziona come `Td`: chi impagina con la matrice (InDesign,
        // molti generatori) altrimenti consegna la pagina su una riga sola.
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
    // Ricompone le parole spezzate a fine riga con trattino.
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .trim();
}

/**
 * Caratteri che un documento italiano può contenere: lettere (accentate
 * comprese), cifre, spaziatura e la punteggiatura d'uso corrente.
 *
 * Comprende anche i punti elenco e le legature (ﬁ, ﬂ), che escono di continuo
 * da un PDF ben estratto. Deliberatamente *non* comprende i caratteri di
 * controllo, i simboli sciolti (¨ ¤ ± ¬ ¶) e le lettere fuori dall'alfabeto
 * latino: sono esattamente ciò che produce un'estrazione andata male, cioè un
 * font senza ToUnicode letto come latin1 (`Ã¨`, `â¬`) o gli indici di glifo
 * grezzi (`\x01\x02`).
 */
const PLAUSIBLE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:!?'"()[\]{}«»“”‘’%&@#*+=/\\<>_°§©®™•·…€$£–—ﬀ-ﬆ-]/g;

/**
 * Quota di caratteri plausibili: se è bassa, l'estrazione è andata male.
 *
 * La metrica precedente contava solo lettere e spazi, quindi ogni cifra e ogni
 * segno d'interpunzione valeva zero. Su un contratto formattato — articoli
 * numerati, importi, IVA, P.IVA — misurava 0,70 (una tabella di costi anche
 * meno) contro lo 0,99 della prosa: un documento estratto benissimo passava a
 * un soffio dalla soglia di 0,5, e bastava un allegato tariffario per farlo
 * dichiarare inaffidabile. Contare anche cifre e punteggiatura rende la misura
 * insensibile alla formattazione e sensibile solo al mojibake, che è la cosa
 * che vogliamo davvero riconoscere. Misurato: prosa, tabella di importi ed
 * elenco puntato stanno tutti a 1,00; il testo mojibake a 0,88; i glifi grezzi
 * a 0,60. La soglia sta a 0,90, cioè nel vuoto fra le due popolazioni.
 */
function plausibleRatio(text) {
  const sample = text.slice(0, 4000);
  if (!sample.length) return 0;
  return (sample.match(PLAUSIBLE) || []).length / sample.length;
}

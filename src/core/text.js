/**
 * Utility di testo: normalizzazione, estrazione da HTML, parsing di importi
 * e durate, segmentazione in clausole.
 *
 * Nessuna dipendenza dal DOM: gira sia nel service worker sia nei test Node.
 */

const CURRENCY_SYMBOLS = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '₣': 'CHF',
  '¥': 'JPY',
};

const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN'];

/**
 * Nei contratti italiani l'importo si scrive «120,00 euro», non «€ 120,00».
 * Senza queste forme la penale e le spese accessorie non venivano estratte
 * affatto — extractPenalty e extractExtraCosts si appoggiano interamente a
 * extractPrices — e sparivano dal numero mostrato in prima pagina.
 *
 * Solo in posizione postfissa: in italiano l'unità segue sempre l'importo.
 */
const CURRENCY_WORDS = {
  euro: 'EUR', euros: 'EUR',
  dollaro: 'USD', dollari: 'USD', 'dólares': 'USD', dolares: 'USD', 'dólar': 'USD', dolar: 'USD',
  sterlina: 'GBP', sterline: 'GBP', libras: 'GBP',
  franco: 'CHF', franchi: 'CHF', francos: 'CHF',
};

/** Rimuove spazi ridondanti e caratteri invisibili. */
export function normalize(text = '') {
  return String(text)
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Estrae il testo leggibile da una stringa HTML, senza usare il DOM
 * (il service worker non ne ha uno).
 */
export function htmlToText(html = '') {
  let out = String(html);
  out = out.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  out = out.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<[^>]+>/g, ' ');
  out = decodeEntities(out);
  return normalize(out);
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  euro: '€', pound: '£', yen: '¥', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
};

export function decodeEntities(text = '') {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Interpreta un importo scritto all'italiana (1.234,56) o all'inglese
 * (1,234.56) e restituisce un numero.
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // L'ultimo separatore che compare è quello decimale.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // "1,99" è decimale; "1,234" con 3 cifre finali è migliaia.
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = '\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';

const PERIOD_WORDS = [
  { re: /\b(al|a|\/)\s*mese\b|\bmensil\w*|\bper month\b|\bmonthly\b|\/\s*(mo|mese|mes|month)\b|\bp\/m\b|\bal\s*mes\b|\bmensual\w*|\bpor\s+mes\b/i, period: 'month' },
  { re: /\b(all'|all\s*|\/)\s*anno\b|\bannual\w*|\bper year\b|\byearly\b|\/\s*(yr|anno|year)\b|\bp\/a\b|\bal\s*a[ñn]o\b|\banual\w*|\bpor\s+a[ñn]o\b/i, period: 'year' },
  { re: /\b(a|alla|\/)\s*settimana\b|\bsettimanal\w*|\bper week\b|\bweekly\b|\/\s*(wk|week|sett)\b|\ba\s*la\s*semana\b|\bsemanal\w*/i, period: 'week' },
  { re: /\b(al|\/)\s*giorno\b|\bgiornalier\w*|\bper day\b|\bdaily\b|\bal\s*d[íi]a\b|\bdiario\b/i, period: 'day' },
  { re: /\btrimestral\w*|\bper quarter\b|\bquarterly\b|\bal\s+trimestre\b|\bogni\s+(?:3|tre)\s+mesi\b|\bcada\s+(?:3|tres)\s+meses\b/i, period: 'quarter' },
  { re: /\bbimestral\w*|\bal\s+bimestre\b|\bogni\s+(?:2|due)\s+mesi\b|\bcada\s+(?:2|dos)\s+meses\b/i, period: 'bimonth' },
  { re: /\bsemestral\w*|\bal\s+semestre\b|\bogni\s+(?:6|sei)\s+mesi\b|\bevery\s+six\s+months\b|\bcada\s+(?:6|seis)\s+meses\b/i, period: 'semester' },
  // La fatturazione a 28 giorni è stata al centro di un caso AGCOM: tredici
  // cicli l'anno invece di dodici, cioè un rincaro dell'8% presentato come
  // «canone invariato».
  { re: /\bogni\s+28\s+giorni\b|\bevery\s+28\s+days\b|\bcada\s+28\s+d[íi]as\b/i, period: 'fourweeks' },
];

export const PERIOD_MONTHS = {
  day: 1 / 30, week: 1 / 4.345, fourweeks: 12 / 13, month: 1,
  bimonth: 2, quarter: 3, semester: 6, year: 12,
};

/**
 * Trova gli importi presenti in un testo, con valuta e ricorrenza.
 * Restituisce una lista ordinata per posizione.
 */
export function extractPrices(text = '') {
  const src = normalize(text);
  const results = [];
  const symbolClass = Object.keys(CURRENCY_SYMBOLS).map(escapeRe).join('');
  const codeAlt = CURRENCY_CODES.join('|');
  const wordAlt = Object.keys(CURRENCY_WORDS).join('|');
  const pattern = new RegExp(
    `(?:([${symbolClass}])|\\b(${codeAlt})\\b)\\s*(${AMOUNT})|(${AMOUNT})\\s*(?:([${symbolClass}])|\\b(${codeAlt})\\b|\\b(${wordAlt})\\b)`,
    'gi'
  );

  let m;
  while ((m = pattern.exec(src)) !== null) {
    const symbol = m[1] || m[5];
    const code = m[2] || m[6];
    const word = m[7];
    const amount = parseAmount(m[3] || m[4]);
    if (amount == null) continue;
    const currency = code
      ? code.toUpperCase()
      : word
        ? CURRENCY_WORDS[word.toLowerCase()]
        : CURRENCY_SYMBOLS[symbol] || 'EUR';
    // La ricorrenza segue quasi sempre l'importo ("19,99 al mese"). Si guarda
    // prima dopo; solo l'immediato prima ("canone mensile di 19,99"), altrimenti
    // un "al mese" di un altro importo contaminerebbe questo.
    const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const head = src.slice(Math.max(0, m.index - 18), m.index);
    let period = null;
    for (const p of PERIOD_WORDS) {
      if (p.re.test(tail) || p.re.test(head)) {
        period = p.period;
        break;
      }
    }
    results.push({
      amount,
      currency,
      period,
      raw: m[0].trim(),
      context: normalize(src.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)),
      index: m.index,
    });
  }
  return results;
}

/**
 * Numerali scritti a parole.
 *
 * «Durata minima di ventiquattro mesi» e «24 (ventiquattro) mesi» sono la
 * stereotipia dei contratti italiani formali, e nessuna delle due veniva
 * riconosciuta. Quando la durata minima non si estrae, computeCost ripiega su
 * un orizzonte di 12 mesi: un vincolo di 24 diventa metà, e l'impegno mostrato
 * è la metà di quello vero — l'errore esatto che il prodotto esiste per non fare.
 */
const WORD_NUMBERS = (() => {
  const units = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
  const teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici',
    'sedici', 'diciassette', 'diciotto', 'diciannove'];
  const tens = { 20: 'venti', 30: 'trenta', 40: 'quaranta', 50: 'cinquanta', 60: 'sessanta' };
  const map = new Map([['un', 1], ['uno', 1], ['una', 1]]);
  units.forEach((w, i) => w && map.set(w, i));
  teens.forEach((w, i) => map.set(w, 10 + i));
  for (const [n, w] of Object.entries(tens)) {
    map.set(w, Number(n));
    for (let i = 1; i <= 9; i += 1) {
      // ventuno, ventotto: davanti a «uno» e «otto» la vocale finale cade.
      const base = i === 1 || i === 8 ? w.slice(0, -1) : w;
      map.set(base + units[i], Number(n) + i);
    }
  }
  const en = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20, 'twenty-four': 24, 'thirty-six': 36,
  };
  for (const [w, n] of Object.entries(en)) map.set(w, n);

  /**
   * Spagnolo. Da 21 a 29 è una parola sola («veinticuatro»), da 31 in su sono
   * tre («treinta y seis»): l'alternanza nella regex accetta gli spazi, quindi
   * le forme composte funzionano purché stiano nella tabella.
   * Sono incluse le grafie senza accento, molto diffuse nei siti reali.
   */
  const es = {
    un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
    nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    'dieciséis': 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, 'veintidós': 22, veintidos: 22, 'veintitrés': 23,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  };
  for (const [w, n] of Object.entries(es)) map.set(w, n);
  // «treinta y seis», «cuarenta y ocho»: composte, ma sono quelle che compaiono
  // davvero nei contratti di permanenza.
  for (const [decina, base] of [['treinta', 30], ['cuarenta', 40], ['cincuenta', 50]]) {
    for (const [units, n] of Object.entries(es)) {
      if (n < 1 || n > 9) continue;
      map.set(`${decina} y ${units}`, base + n);
    }
  }
  return map;
})();

const DURATION_UNITS = {
  giorno: 1 / 30, giorni: 1 / 30, gg: 1 / 30, day: 1 / 30, days: 1 / 30,
  settimana: 1 / 4.345, settimane: 1 / 4.345, week: 1 / 4.345, weeks: 1 / 4.345,
  mese: 1, mesi: 1, mensilita: 1, month: 1, months: 1,
  anno: 12, anni: 12, annualita: 12, year: 12, years: 12,
  // Spagnolo. unitKey() toglie gli accenti, quindi «día» arriva qui come «dia»
  // e «año» come «ano»: le chiavi vanno scritte già normalizzate.
  dia: 1 / 30, dias: 1 / 30,
  mes: 1, meses: 1,
  semana: 1 / 4.345, semanas: 1 / 4.345,
  mensualidad: 1, mensualidades: 1,
  ano: 12, anos: 12, anualidad: 12, anualidades: 12,
};

/** Durate espresse da un aggettivo invece che da un numero. */
const DURATION_ADJECTIVES = [
  [/\bbimestral\w*|\bbimestre\b/i, 2],
  [/\btrimestral\w*|\btrimestre\b/i, 3],
  [/\bquadrimestral\w+|\bcuatrimestral\w*/i, 4],
  [/\bsemestral\w*|\bsemestre\b/i, 6],
  [/\bbienn\w+|\bbienal\w*|\bbienio\b/i, 24],
  [/\btrienn\w+|\btrienal\w*|\btrienio\b/i, 36],
  [/\bquadrienn\w+|\bcuatrienal\w*/i, 48],
  [/\bquinquenn\w+|\bquinquenal\w*|\bquinquenio\b/i, 60],
];

const UNIT_ALT = [
  // italiano
  'mesi', 'mese', 'mensilit[àa]', 'anni', 'anno', 'annualit[àa]',
  'settimane', 'settimana', 'giorni', 'giorno', 'gg\\.?',
  // inglese
  'months?', 'years?', 'weeks?', 'days?',
  // spagnolo
  // `meses` prima di `mese`: l'alternativa italiana aggancia il prefisso e poi
  // il lookahead la respinge, quindi senza la forma spagnola la durata svanisce.
  'meses', 'mes', 'mensualidades', 'mensualidad', 'anualidades', 'anualidad',
  'a[ñn]os', 'a[ñn]o', 'semanas', 'semana', 'd[íi]as', 'd[íi]a',
].join('|');
const WORD_ALT = [...WORD_NUMBERS.keys()].sort((a, b) => b.length - a.length).join('|');

/**
 * Tre forme, un solo passaggio:
 *  1. «24 mesi», e anche «24 (ventiquattro) mesi» — la parentesi si ignora;
 *  2. «ventiquattro mesi», «un anno», «twelve months»;
 *  3. «durata biennale» — trattata a parte, non ha un numero da leggere.
 */
const DURATION_RE = new RegExp(
  '\\b(\\d{1,3})\\s*(?:\\([a-zà-ù\\s]+\\)\\s*)?(' + UNIT_ALT + ')(?=\\W|$)' +
    '|\\b(' + WORD_ALT + ')\\s+(' + UNIT_ALT + ')(?=\\W|$)',
  'gi'
);

/** Normalizza l'unità per la tabella: via accenti e punto abbreviativo. */
function unitKey(unit) {
  return unit.toLowerCase().replace(/\./g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Estrae durate espresse in linguaggio naturale, normalizzate in mesi. */
export function extractDurations(text = '') {
  const src = normalize(text);
  const out = [];
  let m;
  DURATION_RE.lastIndex = 0;
  while ((m = DURATION_RE.exec(src)) !== null) {
    const isDigits = m[1] != null;
    const value = isDigits ? Number.parseInt(m[1], 10) : WORD_NUMBERS.get(m[3].toLowerCase());
    const unit = (isDigits ? m[2] : m[4]).toLowerCase();
    if (!Number.isFinite(value)) continue;
    const months = value * (DURATION_UNITS[unitKey(unit)] ?? 1);
    out.push({
      value,
      unit,
      months,
      raw: m[0],
      context: normalize(src.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80)),
      // Finestra stretta: serve a capire a *cosa* si riferisce questa durata.
      // Con ±80 caratteri, in un contratto scritto di seguito, "24 mesi" si
      // porta dentro la "disdetta" della frase successiva e viene scambiata
      // per un preavviso.
      near: normalize(src.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)),
      index: m.index,
    });
  }

  // «durata biennale», «fatturazione semestrale»: nessun numero da leggere.
  for (const [re, months] of DURATION_ADJECTIVES) {
    const hit = re.exec(src);
    if (!hit) continue;
    out.push({
      value: months,
      unit: 'mesi',
      months,
      raw: hit[0],
      context: normalize(src.slice(Math.max(0, hit.index - 80), hit.index + hit[0].length + 80)),
      near: normalize(src.slice(Math.max(0, hit.index - 30), hit.index + hit[0].length + 30)),
      index: hit.index,
    });
  }

  return out.sort((a, b) => a.index - b.index);
}

/** Fine di frase: punto, esclamativo o interrogativo, con la chiusura che segue. */
const SENTENCE_END = /[.!?][»"'’”)\]]?$/;

/**
 * Raggruppa i paragrafi prima della segmentazione, accorpando le righe corte
 * consecutive.
 *
 * Serve perché innerText di una pagina reale mette ogni <li> e ogni cella di
 * tabella su una riga a sé: prese una a una restano sotto minLength e vengono
 * scartate. Il riepilogo dell'offerta — «• Rinnovo automatico / • Penale di
 * 120 euro / • Durata minima 24 mesi» — è esattamente questa forma, ed è la
 * forma in cui un checkout mostra le condizioni. Senza l'accorpamento il
 * motore a regole non ci vede nulla.
 *
 * L'indice conservato è quello della prima riga del gruppo: resta una
 * posizione valida nel testo originale, e la citazione mostra il gruppo intero
 * invece di una voce mozza.
 */
function groupParagraphs(src, minLength, maxLength) {
  const out = [];
  let offset = 0;
  let run = null;

  const flush = () => {
    if (run) out.push(run);
    run = null;
  };

  for (const para of src.split(/\n+/)) {
    const rawStart = src.indexOf(para, offset);
    offset = rawStart + para.length;
    const body = para.trim();
    if (!body) continue;
    const start = rawStart + para.indexOf(body);

    if (run) {
      /**
       * Due casi diversi, stessa cura:
       *  - il gruppo aperto non chiude una frase: la riga successiva ne è la
       *    prosecuzione. È il testo con a capo fissi — PDF, email, <pre> —
       *    dove «Gli importi versati non sono | rimborsabili» finiva in due
       *    clausole diverse e nessuna regola lo agganciava più;
       *  - il gruppo chiude la frase ma la riga nuova è corta: è una voce di
       *    elenco o una cella di tabella, e da sola non dice nulla.
       *
       * Ricomporre le righe allarga la finestra dei negatori, quindi ha senso
       * solo con la negazione valutata per frase (vedi rules.js): da sole, le
       * due cose si fanno male a vicenda.
       */
      const continues = !SENTENCE_END.test(run.text) || body.length < minLength;
      if (continues && run.text.length + 1 + body.length <= maxLength) {
        run.text = `${run.text} ${body}`;
        continue;
      }
      flush();
    }
    run = { text: body, index: start };
  }
  flush();
  return out;
}

/**
 * Spezza un documento in clausole/frasi analizzabili.
 * Mantiene la posizione originale per poter citare il testo esatto.
 */
export function splitClauses(text = '', { minLength = 40, maxLength = 900 } = {}) {
  const src = normalize(text);
  const chunks = [];
  const paragraphs = groupParagraphs(src, minLength, maxLength);

  for (const { text: para, index: paraStart } of paragraphs) {
    if (para.length < minLength) continue;

    if (para.length <= maxLength) {
      chunks.push({ text: para.trim(), index: paraStart });
      continue;
    }
    // Paragrafo lungo: taglia per frasi.
    const sentenceRe = /[^.!?;]+[.!?;]+|\S[^.!?;]*$/g;
    let s;
    let buffer = '';
    let bufferStart = paraStart;
    while ((s = sentenceRe.exec(para)) !== null) {
      if (buffer.length + s[0].length > maxLength && buffer.trim().length >= minLength) {
        chunks.push({ text: buffer.trim(), index: bufferStart });
        buffer = '';
        bufferStart = paraStart + s.index;
      }
      if (!buffer) bufferStart = paraStart + s.index;
      buffer += s[0];
    }
    if (buffer.trim().length >= minLength) {
      chunks.push({ text: buffer.trim(), index: bufferStart });
    }
  }
  return chunks;
}

/** Accorcia un testo mantenendo inizio e fine (le parti più informative). */
export function truncateMiddle(text = '', limit = 24000) {
  const src = normalize(text);
  if (src.length <= limit) return src;
  const head = src.slice(0, Math.floor(limit * 0.65));
  const tail = src.slice(-Math.floor(limit * 0.3));
  return `${head}\n\n[…testo omesso per lunghezza…]\n\n${tail}`;
}

export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hash stabile e veloce (FNV-1a) per la cache delle analisi. */
export function hashText(text = '') {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function formatMoney(amount, currency = 'EUR', locale = 'it-IT') {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

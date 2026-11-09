/**
 * Utility di testo: normalizzazione, estrazione da HTML, importi, impronte.
 * Il riconoscimento delle clausole e delle cifre nel testo lo fa il server.
 *
 * Nessuna dipendenza dal DOM: gira sia nel service worker sia nei test Node.
 */

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

export const PERIOD_MONTHS = {
  day: 1 / 30, week: 1 / 4.345, fourweeks: 12 / 13, month: 1,
  bimonth: 2, quarter: 3, semester: 6, year: 12,
};

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

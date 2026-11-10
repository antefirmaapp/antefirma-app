/**
 * Text utilities: normalisation, extraction from HTML, amounts, fingerprints.
 * Recognising clauses and figures in the text is the server's job.
 *
 * No DOM dependency: it runs both in the service worker and in Node tests.
 */

import { locale as currentLocale } from '../i18n/index.js';

/** Removes redundant spaces and invisible characters. */
export function normalize(text = '') {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts readable text from an HTML string, without the DOM (the service
 * worker has none).
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
 * Parses an amount written the Italian way (1.234,56) or the English way
 * (1,234.56) and returns a number.
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // The last separator present is the decimal one.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // "1,99" is decimal; "1,234" with 3 trailing digits is thousands.
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

/** Stable, fast hash (FNV-1a) for the analysis cache. */
export function hashText(text = '') {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function formatMoney(amount, currency = 'EUR', locale = currentLocale()) {
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

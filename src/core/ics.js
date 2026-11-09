/**
 * Esportazione in formato calendario (RFC 5545).
 *
 * Il promemoria dell'estensione funziona solo se Chrome è aperto. La scadenza
 * di una disdetta è una cosa troppo costosa per dipendere da questo: meglio
 * metterla anche nel calendario dell'utente, dove sopravvive a tutto.
 */

import { formatMoney } from './text.js';
import { costOfDoingNothing, formatDate } from './commitments.js';
import { t } from '../i18n/index.js';

const CRLF = '\r\n';

/**
 * Costruisce un file .ics con la scadenza di disdetta e, se nota, la data di
 * rinnovo. L'evento porta con sé i promemoria a 30, 7 e 1 giorno.
 */
export function buildIcs(commitment, { now = Date.now(), prodId = '-//AnteFirma//IT' } = {}) {
  if (!commitment?.deadlineAt && !commitment?.renewalAt) return null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (commitment.deadlineAt) {
    lines.push(...event({
      uid: `${commitment.id}-disdetta@vincolo`,
      start: new Date(commitment.deadlineAt),
      stamp: new Date(now),
      summary: t('Disdetta {x}', { x: commitment.provider || commitment.host || '' }).trim(),
      description: deadlineDescription(commitment),
      url: commitment.url,
      alarms: [30, 7, 1],
    }));
  }

  if (commitment.renewalAt) {
    lines.push(...event({
      uid: `${commitment.id}-rinnovo@vincolo`,
      start: new Date(commitment.renewalAt),
      stamp: new Date(now),
      summary: t('Rinnovo {x}', { x: commitment.provider || commitment.host || '' }).trim(),
      description: renewalDescription(commitment),
      url: commitment.url,
      alarms: [],
    }));
  }

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

function event({ uid, start, stamp, summary, description, url, alarms }) {
  const out = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utc(stamp)}`,
    `DTSTART;VALUE=DATE:${date(start)}`,
    `DTEND;VALUE=DATE:${date(addDays(start, 1))}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
  ];
  if (url) out.push(`URL:${esc(url)}`);
  out.push('TRANSP:TRANSPARENT');

  for (const days of alarms) {
    out.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-P${days}D`,
      `DESCRIPTION:${esc(t('{x} — mancano {n} giorni', { x: summary, n: days }))}`,
      'END:VALARM'
    );
  }

  out.push('END:VEVENT');
  return out.map(fold);
}

function deadlineDescription(c) {
  const bits = [t('Ultimo giorno utile per disdire {x}.', { x: c.provider || c.host || t('il servizio') })];
  if (c.noticeMonths) {
    bits.push(t('Il contratto richiede un preavviso di circa {n} giorni.', { n: Math.round(c.noticeMonths * 30) }));
  }
  if (c.renewalAt) bits.push(t('Scadenza del periodo: {d}.', { d: formatDate(new Date(c.renewalAt)) }));

  const doing = costOfDoingNothing(c);
  if (doing) bits.push(doing.label);
  else if (c.worstCase != null) {
    bits.push(t('Impegno stimato: {x}.', { x: formatMoney(c.worstCase, c.currency) }));
  }
  if (c.penalty != null) bits.push(t('Penale di recesso anticipato: {x}.', { x: formatMoney(c.penalty, c.currency) }));
  if (c.url) bits.push(t('Pagina: {x}', { x: c.url }));
  bits.push(t('Promemoria creato da AnteFirma.'));
  return bits.join('\n');
}

function renewalDescription(c) {
  const bits = [t('Il contratto con {x} si rinnova oggi.', { x: c.provider || c.host || t('il fornitore') })];
  const doing = costOfDoingNothing(c);
  if (doing) bits.push(doing.label);
  return bits.join('\n');
}

// ── formattazione RFC 5545 ──────────────────────────────────────────────────

function utc(d) {
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function date(d) {
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function p(n) {
  return String(n).padStart(2, '0');
}

function addDays(d, n) {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Le righe oltre 75 ottetti vanno spezzate con uno spazio iniziale. */
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join(CRLF);
}

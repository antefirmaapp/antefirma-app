/**
 * Esportazione in formato calendario (RFC 5545).
 *
 * Il promemoria dell'estensione funziona solo se Chrome è aperto. La scadenza
 * di una disdetta è una cosa troppo costosa per dipendere da questo: meglio
 * metterla anche nel calendario dell'utente, dove sopravvive a tutto.
 */

import { formatMoney } from './text.js';
import { costOfDoingNothing, formatDate } from './commitments.js';

const CRLF = '\r\n';

/**
 * Costruisce un file .ics con la scadenza di disdetta e, se nota, la data di
 * rinnovo. L'evento porta con sé i promemoria a 30, 7 e 1 giorno.
 */
export function buildIcs(commitment, { now = Date.now(), prodId = '-//Vincolo//IT' } = {}) {
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
      summary: `Disdetta ${commitment.provider || commitment.host || ''}`.trim(),
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
      summary: `Rinnovo ${commitment.provider || commitment.host || ''}`.trim(),
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
      `DESCRIPTION:${esc(`${summary} — mancano ${days} giorni`)}`,
      'END:VALARM'
    );
  }

  out.push('END:VEVENT');
  return out.map(fold);
}

function deadlineDescription(c) {
  const bits = [`Ultimo giorno utile per disdire ${c.provider || c.host || 'il servizio'}.`];
  if (c.noticeMonths) {
    bits.push(`Il contratto richiede un preavviso di circa ${Math.round(c.noticeMonths * 30)} giorni.`);
  }
  if (c.renewalAt) bits.push(`Scadenza del periodo: ${formatDate(new Date(c.renewalAt))}.`);

  const doing = costOfDoingNothing(c);
  if (doing) bits.push(doing.label);
  else if (c.worstCase != null) {
    bits.push(`Impegno stimato: ${formatMoney(c.worstCase, c.currency)}.`);
  }
  if (c.penalty != null) bits.push(`Penale di recesso anticipato: ${formatMoney(c.penalty, c.currency)}.`);
  if (c.url) bits.push(`Pagina: ${c.url}`);
  bits.push('Promemoria creato da Vincolo.');
  return bits.join('\n');
}

function renewalDescription(c) {
  const bits = [`Il contratto con ${c.provider || c.host || 'il fornitore'} si rinnova oggi.`];
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

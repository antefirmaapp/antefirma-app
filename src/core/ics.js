/**
 * Calendar export (RFC 5545).
 *
 * The extension's reminder only works while Chrome is open. A cancellation
 * deadline is too costly to depend on that: better to put it in the user's
 * calendar too, where it survives everything.
 */

import { formatMoney } from './text.js';
import { costOfDoingNothing, formatDate } from './commitments.js';
import { t } from '../i18n/index.js';

const CRLF = '\r\n';

/**
 * Builds an .ics file with the cancellation deadline and, when known, the
 * renewal date. The event carries reminders at 30, 7 and 1 day.
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
      summary: t('cancelX', { x: commitment.provider || commitment.host || '' }).trim(),
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
      summary: t('xRenewal', { x: commitment.provider || commitment.host || '' }).trim(),
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
      `DESCRIPTION:${esc(t('xNDaysLeft', { x: summary, n: days }))}`,
      'END:VALARM'
    );
  }

  out.push('END:VEVENT');
  return out.map(fold);
}

function deadlineDescription(c) {
  const bits = [t('lastDayCancelX', { x: c.provider || c.host || t('service') })];
  if (c.noticeMonths) {
    bits.push(t('contractRequiresAboutNDaysNotice', { n: Math.round(c.noticeMonths * 30) }));
  }
  if (c.renewalAt) bits.push(t('endPeriodD', { d: formatDate(new Date(c.renewalAt)) }));

  const doing = costOfDoingNothing(c);
  if (doing) bits.push(doing.label);
  else if (c.worstCase != null) {
    bits.push(t('estimatedCommitmentX', { x: formatMoney(c.worstCase, c.currency) }));
  }
  if (c.penalty != null) bits.push(t('earlyTerminationFeeX', { x: formatMoney(c.penalty, c.currency) }));
  if (c.url) bits.push(t('pageX', { x: c.url }));
  bits.push(t('reminderCreatedAntefirma'));
  return bits.join('\n');
}

function renewalDescription(c) {
  const bits = [t('contractXRenewsToday', { x: c.provider || c.host || t('provider') })];
  const doing = costOfDoingNothing(c);
  if (doing) bits.push(doing.label);
  return bits.join('\n');
}

// ── RFC 5545 formatting ─────────────────────────────────────────────────────

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

/** Lines over 75 octets must be folded with a leading space. */
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

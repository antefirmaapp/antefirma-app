/**
 * The commitment register: the piece that turns a ten-second warning into
 * something still useful twenty-four months later.
 *
 * Every competitor helps you *not get in*. Nobody helps you *get out*. Here an
 * accepted commitment becomes a deadline with reminders and, when the time
 * comes, a letter already written.
 *
 * Pure logic: no Chrome APIs, so it can be tested in Node.
 */

import { formatMoney, PERIOD_MONTHS } from './text.js';
import { t, tn, locale } from '../i18n/index.js';

export const COMMITMENT_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  IGNORED: 'ignored',
};

const DAY = 86_400_000;

/** How many days before the deadline to get in touch. */
export const REMINDER_OFFSETS_DAYS = [30, 7, 1];

/**
 * Builds a commitment from the verdict, at the moment the user decides to go
 * ahead.
 */
export function buildCommitment({ verdict = {}, snapshot = null, decision = 'proceed', now = Date.now(), id = null } = {}) {
  const cost = verdict.cost || {};
  const start = new Date(now);

  const horizonMonths = cost.horizonMonths ?? null;
  const noticeMonths = cost.notice?.months ?? null;

  const renewalAt = horizonMonths ? addMonths(start, horizonMonths) : null;
  const deadlineAt = renewalAt && noticeMonths ? addMonths(renewalAt, -noticeMonths) : renewalAt;

  const recurring = (cost.lines || []).find((l) => l.kind === 'recurring') || null;

  return {
    id: id || makeId(now),
    createdAt: start.toISOString(),
    status: COMMITMENT_STATUS.ACTIVE,
    decision,

    host: verdict.host || null,
    url: verdict.url || null,
    title: verdict.title || null,
    provider: providerName(verdict),
    actionType: verdict.actionType || null,
    termsUrl: verdict.termsUrl || snapshot?.termsUrl || null,

    headline: verdict.headline || null,
    score: verdict.score ?? null,
    level: verdict.level?.id ?? null,
    categories: (verdict.findings || []).map((f) => f.category),

    currency: cost.currency || 'EUR',
    // The unit price and its period: without them a later comparison would
    // start from a different context and lie about the numbers.
    pricing: verdict.pricing
      ? { amount: verdict.pricing.amount ?? null, currency: verdict.pricing.currency || 'EUR', period: verdict.pricing.period || null, recurring: Boolean(verdict.pricing.recurring) }
      : null,
    worstCase: cost.worstCase ?? null,
    recurringTotal: recurring?.amount ?? null,
    horizonMonths,
    noticeMonths,
    autoRenewal: Boolean(cost.hasAutoRenewal),
    penalty: cost.penalty?.amount ?? null,

    renewalAt: renewalAt ? renewalAt.toISOString() : null,
    deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,

    snapshot: snapshot
      ? { hash: snapshot.hash, at: snapshot.at, chars: snapshot.chars, excerpt: snapshot.excerpt }
      : null,
    lastCheck: null,
    changes: [],
    reminders: [],
    notes: null,
  };
}

/**
 * Those who collect on someone else's behalf: the domain is the payment
 * service's, not the seller's. There the seller is looked for in the page title.
 */
const PAYMENT_HOSTS = /(^|\.)(paddle\.com|stripe\.com|paypal\.com|lemonsqueezy\.com|chargebee\.com|recurly\.com|fastspring\.com|gumroad\.com|2checkout\.com|checkout\.com|adyen\.com|mollie\.com|klarna\.com|satispay\.com|nexi\.it|sumup\.com|shopify\.com)$/i;
const CHECKOUT_WORDS = /\b(checkout|check-out|pagamento|pago|payment|pay|paga|secure|sicuro|seguro|cassa|ordine|order|pedido|paddle|stripe|paypal|lemon ?squeezy|chargebee|recurly|fastspring|gumroad|klarna|sandbox)\b/gi;
export const isPaymentHost = (host = '') => PAYMENT_HOSTS.test(String(host).replace(/^www\./, ''));

/** The seller from a payment page title ("Checkout – Acme Pro" → "Acme Pro"); null if absent. */
export function merchantFromTitle(title = '') {
  const parts = String(title).split(/\s+[-–—|·:]\s+|\s*\|\s*/).map((p) => p.replace(CHECKOUT_WORDS, '').replace(/\s{2,}/g, ' ').trim())
    .filter((p) => p.length >= 2 && /\p{L}/u.test(p));
  return parts[0] ? parts[0].slice(0, 60) : null;
}

/** A readable provider name, from the title or the domain. */
export function providerName(verdict = {}) {
  const host = (verdict.host || '').replace(/^www\./, '');
  // Without site or title the name stays empty: letter and panel use the placeholder in their language.
  if (!host) return verdict.title || null;
  // A Paddle, Stripe… page: the right name is in the title; otherwise empty, and it can be renamed in the panel.
  if (isPaymentHost(host)) return (verdict.merchant && merchantFromTitle(verdict.merchant)) || merchantFromTitle(verdict.title || '');
  const base = host.split('.')[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : host;
}

/**
 * The reminder plan: **data, not alarms**.
 *
 * The previous version scheduled three `chrome.alarms` 690, 713 and 719 days
 * ahead. An alarm that far away is a gamble: it isn't guaranteed to survive an
 * extension update, and if it fires with the browser closed it is simply lost —
 * silence, at the very moment the warning mattered.
 *
 * Now the plan is a list saved with the commitment, and a daily pass decides
 * what is due. If a day is skipped, the next day catches up.
 */
export function planReminders(commitment, now = Date.now()) {
  if (!commitment?.deadlineAt) return [];
  const deadline = new Date(commitment.deadlineAt).getTime();

  const out = REMINDER_OFFSETS_DAYS.map((days) => {
    const at = deadline - days * DAY;
    return {
      days,
      at: new Date(at).toISOString(),
      // A reminder whose date has already passed is born used: if you record a
      // commitment ten days before the deadline, the "30 days left" reminder
      // must not fire — it would be false and would destroy trust in the one
      // thing that must be exact here, the date.
      fired: at <= now,
    };
  });

  // On the other hand, someone who discovers the extension close to the
  // deadline must be warned at once, with the real number of days.
  const firstReminderAt = deadline - Math.max(...REMINDER_OFFSETS_DAYS) * DAY;
  if (firstReminderAt <= now && deadline > now) {
    out.push({
      days: Math.max(1, Math.round((deadline - now) / DAY)),
      at: new Date(now).toISOString(),
      fired: false,
      kind: 'urgent',
    });
  }

  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * Which reminder is due now.
 *
 * It returns **only one**, the most urgent of those due and not yet sent: after
 * a long browser pause all three would be due, and three notifications in a row
 * about the same contract are a sure way to get switched off.
 */
export function dueReminder(commitment, now = Date.now()) {
  if (!commitment?.reminders?.length) return null;
  if (commitment.status !== COMMITMENT_STATUS.ACTIVE) return null;
  if (new Date(commitment.deadlineAt || 0).getTime() < now) return null;

  const due = commitment.reminders
    .filter((r) => !r.fired && new Date(r.at).getTime() <= now)
    .sort((a, b) => a.days - b.days);

  return due[0] || null;
}

/**
 * The cancellation window closed while nobody was looking.
 * It is unpleasant to read, but silence is worse: without this warning the
 * user finds out about the renewal from their bank statement.
 */
export function missedWindow(commitment, now = Date.now()) {
  if (!commitment?.deadlineAt) return false;
  if (commitment.status !== COMMITMENT_STATUS.ACTIVE) return false;
  if (commitment.missedNotified) return false;
  return new Date(commitment.deadlineAt).getTime() < now;
}

/** Computed state, for the UI. */
export function commitmentState(commitment, now = Date.now()) {
  if (!commitment) return { label: '—', urgency: 'none', daysLeft: null };
  if (commitment.status === COMMITMENT_STATUS.CANCELLED) {
    return { label: t('cancelled2'), urgency: 'done', daysLeft: null };
  }
  if (commitment.status === COMMITMENT_STATUS.IGNORED) {
    return { label: t('ignored'), urgency: 'none', daysLeft: null };
  }
  if (!commitment.deadlineAt) {
    return { label: t('noDeadlineFound'), urgency: 'none', daysLeft: null };
  }

  const daysLeft = Math.ceil((new Date(commitment.deadlineAt).getTime() - now) / DAY);
  if (daysLeft < 0) {
    const renewalPassed = commitment.renewalAt && new Date(commitment.renewalAt).getTime() < now;
    return {
      label: renewalPassed ? t('renewedCancellationWindowHasPassed') : t('cancellationWindowExpired'),
      urgency: 'passed',
      daysLeft,
    };
  }
  if (daysLeft <= 7) return { label: tn(daysLeft, 'cancelWithinNDay', 'cancelWithinNDays'), urgency: 'critical', daysLeft };
  if (daysLeft <= 30) return { label: tn(daysLeft, 'cancelWithinNDay', 'cancelWithinNDays'), urgency: 'soon', daysLeft };
  return { label: t('cancelD', { d: formatDate(new Date(commitment.deadlineAt)) }), urgency: 'later', daysLeft };
}

/**
 * What doing nothing costs you: the number that makes the deadline concrete.
 */
export function costOfDoingNothing(commitment) {
  if (!commitment?.autoRenewal) return null;
  const amount = commitment.recurringTotal ?? commitment.worstCase ?? null;
  if (amount == null) return null;
  return {
    amount,
    currency: commitment.currency || 'EUR',
    label: t('ifDonTCancelNewPeriod', { x: formatMoney(amount, commitment.currency || 'EUR') }),
  };
}

/** Summary of the overall exposure, for the panel header. */
export function portfolioSummary(commitments = [], now = Date.now()) {
  const active = commitments.filter((c) => c.status === COMMITMENT_STATUS.ACTIVE);
  const byCurrency = new Map();
  for (const c of active) {
    if (c.worstCase == null) continue;
    const cur = c.currency || 'EUR';
    byCurrency.set(cur, round2((byCurrency.get(cur) || 0) + c.worstCase));
  }
  const upcoming = active
    .map((c) => ({ c, state: commitmentState(c, now) }))
    .filter((x) => x.state.daysLeft != null && x.state.daysLeft >= 0)
    .sort((a, b) => a.state.daysLeft - b.state.daysLeft);

  return {
    count: active.length,
    totals: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    next: upcoming[0] || null,
    urgent: upcoming.filter((x) => x.state.daysLeft <= 30).length,
  };
}

/** Derives the unit fee, if it can be reconstructed. */
export function unitPrice(commitment) {
  if (commitment.recurringTotal == null || !commitment.horizonMonths) return null;
  const period = commitment.period || 'month';
  const months = PERIOD_MONTHS[period] || 1;
  const cycles = Math.max(1, Math.round(commitment.horizonMonths / months));
  return round2(commitment.recurringTotal / cycles);
}

// ── helper ──────────────────────────────────────────────────────────────────


export function formatDate(d, loc = locale()) {
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const whole = Math.trunc(months);
  const frac = months - whole;
  d.setMonth(d.getMonth() + whole);
  if (frac) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function makeId(now) {
  return `${now.toString(36)}-${Math.floor(Math.random() * 1e8).toString(36)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

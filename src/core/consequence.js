/**
 * Consequence Engine.
 *
 * Turns legal language into two things a person understands directly: **what
 * it can cost me** and **what happens if I click**.
 *
 * It is the part of the product that replaces "Risk score 73/100" with
 * "potential commitment €479.76".
 */

import { formatMoney, PERIOD_MONTHS } from './text.js';
import { t, tn, locale } from '../i18n/index.js';

/**
 * Economic terms read by the server.
 *
 * The server returns each of them with the passage it comes from, and drops
 * those whose figure isn't in that passage: here they are taken as they come,
 * without looking for other numbers in the text. A figure the server could not
 * verify never enters the total.
 */
export function termsFromServer(terms = {}) {
  const t = terms || {};
  const num = (x) => (x && typeof x.value === 'number' && Number.isFinite(x.value) && x.value >= 0 ? x.value : null);
  const minMonths = num(t.minimum_term_months);
  const noticeDays = num(t.notice_days);
  const fee = num(t.exit_fee);
  return {
    price: num(t.price),
    priceQuote: t.price?.quote || null,
    currency: typeof t.currency?.value === 'string' ? t.currency.value.toUpperCase().slice(0, 3) : null,
    period: typeof t.billing_period?.value === 'string' ? t.billing_period.value : null,
    minTerm: minMonths ? { months: minMonths, raw: tn(minMonths, '{n} mese', '{n} mesi', { n: fmtNum(minMonths) }), quote: t.minimum_term_months.quote || null } : null,
    notice: noticeDays ? { months: noticeDays / 30, days: noticeDays, raw: tn(noticeDays, '{n} giorno', '{n} giorni', { n: fmtNum(noticeDays) }), quote: t.notice_days.quote || null } : null,
    penalty: fee != null ? { amount: fee, quote: t.exit_fee.quote || null } : null,
    extras: (Array.isArray(t.extra_fees) ? t.extra_fees : [])
      .filter((e) => e && typeof e.value === 'number' && Number.isFinite(e.value) && e.value > 0)
      .map((e) => ({
        amount: e.value,
        label: (typeof e.label === 'string' && e.label.trim()) || t('Costo aggiuntivo'),
        perCycle: e.per_cycle === true,
        raw: e.quote || null,
      })),
  };
}

/**
 * Merges the price read on the page, near the button, with the one the server
 * read in the text. The page wins: it is the price the person is looking at.
 */
export function mergePricing(pricing = {}, server = {}) {
  const out = { ...(pricing || {}) };
  if (out.amount == null && server.price != null && server.period !== 'once') {
    out.amount = server.price;
    out.period = server.period || out.period;
    out.source = 'server';
  } else if (out.amount == null && server.price != null) {
    out.amount = server.price;
    out.source = 'server';
  }
  if (!out.currency && server.currency) out.currency = server.currency;
  if (!out.period && server.period && server.period !== 'once') out.period = server.period;
  if (out.recurring == null && out.period) out.recurring = true;
  return out;
}

/** The exit fee as a figure: written in the contract, or computed from monthly payments. */
const penaltyOf = (cost) => cost.penalty?.amount ?? (cost.lines || []).find((l) => l.kind === 'penalty')?.amount ?? null;

const NUMBER_WORDS = {
  un: 1, una: 1, uno: 1, one: 1, due: 2, two: 2, dos: 2, tre: 3, three: 3, tres: 3, quattro: 4, four: 4, cuatro: 4,
  cinque: 5, five: 5, cinco: 5, sei: 6, six: 6, seis: 6, dodici: 12, twelve: 12, doce: 12,
};
/** Monthly payments of exit fee written in the quoted sentence ("tre mensilità", "2 monthly payments", "tres cuotas mensuales"). */
export function penaltyFromFindings(findings = []) {
  const f = findings.find((x) => x.category === 'early_termination_penalty' && x.quote);
  if (!f) return null;
  const m = String(f.quote).toLowerCase().match(/\b(\d{1,2}|un|una|uno|one|due|two|dos|tre|three|tres|quattro|four|cuatro|cinque|five|cinco|sei|six|seis|dodici|twelve|doce)\s+(mensilit[àa]|canoni mensili|rate mensili|monthly (?:payments|fees|instalments|installments)|months'? (?:fees|payments)|cuotas mensuales|mensualidades)(?![a-z])/);
  if (!m) return null;
  const months = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  return months ? { months, amount: null, quote: f.quote } : null;
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
}

/**
 * Computes the potential cost of the commitment.
 *
 * The goal is not accounting precision — impossible from a legal text — but
 * giving the user the right order of magnitude before the click, with the
 * formula spelled out so they can judge for themselves.
 */
export function computeCost({ ctx = {}, findings = [], terms = {} } = {}) {
  const pricing = ctx.pricing || {};
  const currency = pricing.currency || terms.currency || 'EUR';

  const minTerm = terms.minTerm || null;
  const notice = terms.notice || null;
  // "A penalty equal to three monthly payments" is not a figure: the server
  // doesn't put it among the economic terms, but it must enter the total (monthly price × months).
  const penalty = terms.penalty || penaltyFromFindings(findings);
  const extras = terms.extras || [];

  const hasAutoRenewal = findings.some((f) => f.category === 'auto_renewal');
  const periodMonths = pricing.period ? PERIOD_MONTHS[pricing.period] || 1 : null;

  // Commitment horizon: the declared minimum term, otherwise one renewal cycle
  // (12 months if yearly/monthly with automatic renewal).
  let horizonMonths = null;
  let horizonReason = null;
  if (minTerm) {
    horizonMonths = minTerm.months;
    horizonReason = t('durata minima dichiarata: {x}', { x: minTerm.raw });
  } else if (hasAutoRenewal && periodMonths) {
    horizonMonths = Math.max(12, periodMonths);
    horizonReason = t('rinnovo automatico, orizzonte prudenziale di 12 mesi');
  } else if (periodMonths) {
    horizonMonths = periodMonths;
    horizonReason = t('un solo ciclo di fatturazione');
  }

  const lines = [];
  let total = 0;
  let hasRecurring = false;

  let cycles = 1;
  if (pricing.amount != null && periodMonths && horizonMonths) {
    cycles = Math.max(1, Math.round(horizonMonths / periodMonths));
    const sub = round2(pricing.amount * cycles);
    total += sub;
    hasRecurring = true;
    lines.push({
      label: `${formatMoney(pricing.amount, currency)} × ${cycles} ${cycleWord(pricing.period, cycles)}`,
      amount: sub,
      kind: 'recurring',
    });
  } else if (pricing.amount != null) {
    total += pricing.amount;
    lines.push({ label: t('Importo'), amount: round2(pricing.amount), kind: 'oneoff' });
  }

  if (penalty) {
    if (penalty.amount != null) {
      total += penalty.amount;
      lines.push({ label: t('Penale di recesso'), amount: round2(penalty.amount), kind: 'penalty' });
    } else if (penalty.months && pricing.amount != null && pricing.period === 'month') {
      const p = round2(pricing.amount * penalty.months);
      total += p;
      lines.push({ label: t('Penale ({n} mensilità)', { n: penalty.months }), amount: p, kind: 'penalty' });
    } else {
      lines.push({ label: t('Penale di recesso (importo non quantificato)'), amount: null, kind: 'penalty' });
    }
  }

  for (const e of extras) {
    if (e.amount == null) continue;
    // A per-instalment fee must be multiplied by the cycles: counting it once
    // is the mistake that makes two thirds of its weight disappear.
    const times = e.perCycle && cycles > 1 ? cycles : 1;
    const sub = round2(e.amount * times);
    total += sub;
    lines.push({
      label: times > 1 ? `${e.label} (${formatMoney(e.amount, currency)} × ${times})` : e.label,
      amount: sub,
      kind: 'extra',
    });
  }

  const displayed = pricing.amount != null
    ? formatMoney(pricing.amount, currency) + (pricing.period ? ` / ${periodLabel(pricing.period)}` : '')
    : null;

  const worstCase = lines.length && total > 0 ? round2(total) : null;
  const uncertain = lines.some((l) => l.amount == null) || (!minTerm && hasAutoRenewal);

  return {
    currency,
    displayed,
    worstCase,
    worstCaseLabel: worstCase != null ? formatMoney(worstCase, currency) : null,
    lines,
    horizonMonths,
    horizonReason,
    minTerm,
    notice,
    penalty,
    extras,
    hasRecurring,
    hasAutoRenewal,
    uncertain,
    /** True when the price shown clearly underestimates the real commitment. */
    understated:
      worstCase != null &&
      pricing.amount != null &&
      worstCase >= pricing.amount * 3,
  };
}

/**
 * Builds the "what happens if I click" timeline.
 * @param {Date|number} now - reference time (injectable for tests).
 */
export function buildTimeline({ ctx = {}, cost = {}, findings = [], actionType = 'accept_terms', now = Date.now() } = {}) {
  const start = new Date(now);
  const steps = [];

  const immediate = [];
  if (actionType === 'signup' || ctx.form?.isSignup) immediate.push(t('crei l’account'));
  if (actionType === 'accept_terms' || ctx.terms?.found) immediate.push(t('accetti il contratto nella sua interezza'));
  if (actionType === 'purchase') immediate.push(t('l’ordine viene inviato'));
  if (actionType === 'subscribe' || cost.hasRecurring) immediate.push(t('parte l’abbonamento'));
  if (actionType === 'sign') immediate.push(t('il documento risulta firmato'));
  if (findings.some((f) => ['data_sharing', 'profiling', 'data_sale'].includes(f.category))) {
    immediate.push(t('autorizzi il trattamento dei dati descritto nell’informativa'));
  }
  if (findings.some((f) => f.category === 'auto_renewal')) immediate.push(t('accetti il rinnovo automatico'));
  if (!immediate.length) immediate.push(t('l’azione viene completata'));

  steps.push({ when: t('Ora'), at: start.toISOString(), items: immediate, kind: 'now' });

  if (ctx.pricing?.trial?.months) {
    const trialEnd = addMonths(start, ctx.pricing.trial.months);
    steps.push({
      when: t('Tra {x}', { x: ctx.pricing.trial.raw }),
      at: trialEnd.toISOString(),
      items: [
        cost.displayed ? t('finisce la prova gratuita e parte l’addebito di {x}', { x: cost.displayed }) : t('finisce la prova gratuita e parte l’addebito'),
      ],
      kind: 'billing',
    });
  }

  if (cost.horizonMonths) {
    const end = addMonths(start, cost.horizonMonths);
    if (cost.notice?.months) {
      const deadline = addMonths(end, -cost.notice.months);
      steps.push({
        when: t('Entro il {d}', { d: formatDate(deadline) }),
        at: deadline.toISOString(),
        items: [t('devi inviare la disdetta (preavviso di {x}) — è la data da segnare in calendario', { x: cost.notice.raw })],
        kind: 'deadline',
      });
    }
    steps.push({
      when: `${formatDate(end)}`,
      at: end.toISOString(),
      items: [
        cost.hasAutoRenewal
          ? t('scade il periodo: se non hai disdetto, il contratto si rinnova')
          : t('scade il periodo di impegno'),
      ],
      kind: cost.hasAutoRenewal ? 'renewal' : 'end',
    });

    if (cost.hasAutoRenewal) {
      const nextEnd = addMonths(end, cost.horizonMonths);
      const renewalCost = cost.lines.find((l) => l.kind === 'recurring');
      steps.push({
        when: t('Poi fino al {d}', { d: formatDate(nextEnd) }),
        at: nextEnd.toISOString(),
        items: [
          renewalCost?.amount != null
            ? t('nuovo periodo per altri {x}', { x: formatMoney(renewalCost.amount, cost.currency) })
            : t('nuovo periodo di impegno alle stesse condizioni'),
        ],
        kind: 'renewal',
      });
    }
  }

  if (cost.penalty) {
    steps.push({
      when: t('Se esci prima'),
      at: null,
      items: [
        penaltyOf(cost) != null
          ? t('paghi una penale di {x}', { x: formatMoney(penaltyOf(cost), cost.currency) })
          : t('è prevista una penale di recesso, di importo non chiaramente quantificato'),
      ],
      kind: 'penalty',
    });
  }

  return steps;
}

// ── helper ──────────────────────────────────────────────────────────────────

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const whole = Math.trunc(months);
  const frac = months - whole;
  d.setMonth(d.getMonth() + whole);
  if (frac) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function formatDate(d) {
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
}

function periodLabel(period) {
  const w = { day: 'giorno', week: 'settimana', month: 'mese', quarter: 'trimestre', year: 'anno' }[period];
  return w ? t(w) : period;
}

/** "× 12 months" reads at a glance, "× 12 cycles" doesn't. */
function cycleWord(period, n) {
  const words = {
    month: ['mese', 'mesi'], year: ['anno', 'anni'], week: ['settimana', 'settimane'],
    quarter: ['trimestre', 'trimestri'], semester: ['semestre', 'semestri'],
  };
  const w = words[period] || ['ciclo', 'cicli'];
  return t(n === 1 ? w[0] : w[1]);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}


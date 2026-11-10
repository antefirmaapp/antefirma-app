/**
 * Property-based tests (fast-check): instead of a few hand-picked examples,
 * hundreds of random inputs checked against rules that must always hold.
 *
 *   node --test test/properties.test.mjs
 *
 * When a property fails, fast-check prints the smallest input that breaks it
 * and the seed to replay it (`fc.assert(..., { seed })`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import { parseAmount, normalize, hashText, htmlToText } from '../src/core/text.js';
import { computeCost, penaltyFromFindings } from '../src/core/consequence.js';
import { planReminders, dueReminder, merchantFromTitle, COMMITMENT_STATUS, REMINDER_OFFSETS_DAYS } from '../src/core/commitments.js';
import { moneyPressure, aggregateSeverity, compressSeverity } from '../src/core/scoring.js';
import { buildIcs } from '../src/core/ics.js';

const DAY = 86_400_000;
const RUNS = { numRuns: 300 };

/** Money as it appears on pages: up to a million, in cents. */
const money = fc.integer({ min: 1, max: 100_000_000 }).map((c) => c / 100);
const PERIODS = ['month', 'quarter', 'semester', 'year'];

// ── amounts ─────────────────────────────────────────────────────────────────

test('parseAmount reads back an amount written the Italian, English or plain way', () => {
  fc.assert(fc.property(money, fc.constantFrom('it-IT', 'en-GB', 'plain'), (n, style) => {
    const s = style === 'plain'
      ? n.toFixed(2)
      : n.toLocaleString(style, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    assert.equal(parseAmount(s), n, `${s} → ${parseAmount(s)}`);
  }), RUNS);
});

test('parseAmount never throws, and returns a finite number or null', () => {
  fc.assert(fc.property(fc.oneof(fc.string(), fc.constant(null), fc.integer(), fc.double()), (raw) => {
    const v = parseAmount(raw);
    assert.ok(v === null || Number.isFinite(v));
  }), RUNS);
});

// ── text ────────────────────────────────────────────────────────────────────

test('normalize is idempotent and leaves no invisible characters or runs of spaces', () => {
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('a', 'b', ' ', '\t', '\n', '\r', '\u00a0', '\u200b', '\ufeff', 'é') }), (s) => {
    const once = normalize(s);
    assert.equal(normalize(once), once);
    assert.doesNotMatch(once, /[\u00a0\u200b-\u200d\ufeff\r]|[ \t]{2}|\n{3}/);
  }), RUNS);
});

test('hashText is deterministic and short', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    const h = hashText(s);
    assert.equal(h, hashText(s));
    assert.match(h, /^[0-9a-z]{1,7}$/);
  }), RUNS);
});

test('htmlToText never lets script or style content through', () => {
  const words = fc.stringMatching(/^[a-z ]{0,20}$/);
  fc.assert(fc.property(words, words, (before, after) => {
    const html = `<p>${before}</p><script>SECRET_JS()</script><style>.x{color:red}</style><p>${after}</p>`;
    const text = htmlToText(html);
    assert.doesNotMatch(text, /SECRET_JS|color:red|<|>/);
  }), RUNS);
});

// ── cost ────────────────────────────────────────────────────────────────────

const pricingArb = fc.record({ amount: money, period: fc.constantFrom(...PERIODS), currency: fc.constant('EUR') });
const termsArb = fc.record({
  minTerm: fc.option(fc.integer({ min: 1, max: 60 }).map((months) => ({ months, raw: `${months} months` })), { nil: null }),
  penalty: fc.option(money.map((amount) => ({ amount })), { nil: null }),
  extras: fc.array(fc.record({ label: fc.constant('Fee'), amount: money, perCycle: fc.boolean() }), { maxLength: 3 }),
});
const findingsArb = fc.subarray([{ category: 'auto_renewal', severity: 40 }]);

test('computeCost: the total is the sum of its lines and never below the displayed price', () => {
  fc.assert(fc.property(pricingArb, termsArb, findingsArb, (pricing, terms, findings) => {
    const cost = computeCost({ ctx: { pricing }, terms, findings });
    const sum = cost.lines.reduce((s, l) => s + (l.amount || 0), 0);
    assert.ok(Math.abs(cost.worstCase - sum) < 0.011 * cost.lines.length + 0.001, `${cost.worstCase} vs ${sum}`);
    assert.ok(cost.worstCase >= pricing.amount - 0.005);
    assert.equal(cost.understated, cost.worstCase >= pricing.amount * 3);
  }), RUNS);
});

test('computeCost: a higher fee never lowers the commitment', () => {
  fc.assert(fc.property(pricingArb, termsArb, money, (pricing, terms, more) => {
    const a = computeCost({ ctx: { pricing }, terms }).worstCase;
    const b = computeCost({ ctx: { pricing: { ...pricing, amount: pricing.amount + more } }, terms }).worstCase;
    assert.ok(b >= a);
  }), RUNS);
});

test('computeCost: a monthly minimum term counts exactly that many payments', () => {
  fc.assert(fc.property(money, fc.integer({ min: 1, max: 60 }), (amount, months) => {
    const cost = computeCost({ ctx: { pricing: { amount, period: 'month' } }, terms: { minTerm: { months, raw: '' } } });
    const recurring = cost.lines.find((l) => l.kind === 'recurring');
    assert.equal(recurring.amount, Math.round(amount * months * 100) / 100);
    assert.equal(cost.horizonMonths, months);
  }), RUNS);
});

test('penaltyFromFindings reads "N monthly payments" in three languages', () => {
  const phrase = fc.constantFrom(
    (n) => `è dovuta una penale pari a ${n} mensilità`,
    (n) => `a fee equal to ${n} monthly payments is due`,
    (n) => `se cobrará una penalización de ${n} cuotas mensuales`,
  );
  fc.assert(fc.property(fc.integer({ min: 1, max: 99 }), phrase, (n, make) => {
    const p = penaltyFromFindings([{ category: 'early_termination_penalty', quote: make(n) }]);
    assert.equal(p?.months, n);
  }), RUNS);
});

// ── reminders ───────────────────────────────────────────────────────────────

const now = Date.UTC(2027, 0, 15, 9);
const deadlineArb = fc.integer({ min: -10 * DAY, max: 800 * DAY }).map((d) => now + d);

test('planReminders: sorted, never after the deadline, already-passed ones born fired', () => {
  fc.assert(fc.property(deadlineArb, (deadline) => {
    const plan = planReminders({ deadlineAt: new Date(deadline).toISOString() }, now);
    const times = plan.map((r) => new Date(r.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    for (const r of plan) {
      assert.ok(new Date(r.at).getTime() <= deadline);
      if (r.kind !== 'urgent') assert.equal(r.fired, new Date(r.at).getTime() <= now);
    }
    // Someone close to the deadline is warned at once, with a true number of days.
    const urgent = plan.filter((r) => r.kind === 'urgent');
    const close = deadline > now && deadline - Math.max(...REMINDER_OFFSETS_DAYS) * DAY <= now;
    assert.equal(urgent.length, close ? 1 : 0);
    if (close) assert.ok(urgent[0].days >= 1 && urgent[0].days <= Math.max(...REMINDER_OFFSETS_DAYS));
  }), RUNS);
});

test('dueReminder: at most one, the most urgent due, and nothing after the deadline', () => {
  fc.assert(fc.property(deadlineArb, fc.integer({ min: 0, max: 800 * DAY }), (deadline, later) => {
    const deadlineAt = new Date(deadline).toISOString();
    const c = { deadlineAt, status: COMMITMENT_STATUS.ACTIVE, reminders: planReminders({ deadlineAt }, now) };
    const at = now + later;
    const r = dueReminder(c, at);
    if (at > deadline) return assert.equal(r, null);
    const due = c.reminders.filter((x) => !x.fired && new Date(x.at).getTime() <= at);
    if (!due.length) return assert.equal(r, null);
    assert.equal(r.days, Math.min(...due.map((x) => x.days)));
  }), RUNS);
});

// ── score ───────────────────────────────────────────────────────────────────

test('moneyPressure is monotonic and stays within 0–42', () => {
  fc.assert(fc.property(money, money, (a, b) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    assert.ok(moneyPressure(lo) <= moneyPressure(hi));
    assert.ok(moneyPressure(hi) >= 0 && moneyPressure(hi) <= 42);
  }), RUNS);
});

test('aggregateSeverity: set by the worst, order does not matter, the rest adds at most 30', () => {
  const sev = fc.array(fc.integer({ min: 0, max: 95 }), { minLength: 1, maxLength: 12 });
  fc.assert(fc.property(sev, (list) => {
    const f = list.map((severity) => ({ severity }));
    const raw = aggregateSeverity(f);
    const worst = Math.max(...list);
    assert.equal(raw, aggregateSeverity([...f].reverse()));
    assert.ok(raw >= worst && raw <= worst + 30);
  }), RUNS);
});

test('compressSeverity is monotonic, linear up to 50 and never above 95', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }), (a, b) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    assert.ok(compressSeverity(lo) <= compressSeverity(hi));
    assert.ok(compressSeverity(hi) <= 95);
    if (lo <= 50) assert.equal(compressSeverity(lo), lo);
  }), RUNS);
});

// ── names and calendar ──────────────────────────────────────────────────────

test('merchantFromTitle never throws and returns null or a short name with a letter', () => {
  fc.assert(fc.property(fc.string({ maxLength: 200 }), (title) => {
    const m = merchantFromTitle(title);
    assert.ok(m === null || (m.length >= 1 && m.length <= 60 && /\p{L}/u.test(m)));
  }), RUNS);
});

test('merchantFromTitle finds the seller next to checkout words', () => {
  const name = fc.stringMatching(/^[A-Z][a-z]{2,10}( [A-Z][a-z]{2,8})?$/)
    .filter((n) => !/\b(checkout|payment|pay|secure|order|paddle|stripe|paypal|sandbox)\b/i.test(n));
  fc.assert(fc.property(name, fc.constantFrom('Checkout', 'Pagamento sicuro', 'Secure payment', 'Pago'), fc.constantFrom(' – ', ' | ', ' - '), (n, word, sep) => {
    assert.equal(merchantFromTitle(`${word}${sep}${n}`), n);
  }), RUNS);
});

test('buildIcs: valid lines whatever the provider name', () => {
  fc.assert(fc.property(fc.string({ maxLength: 120 }), deadlineArb, (provider, deadline) => {
    const ics = buildIcs({ id: 'c1', provider, deadlineAt: new Date(deadline).toISOString(), url: 'https://example.com/terms' }, { now });
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
    // No bare line breaks: each one is CRLF, and no line is longer than 75 octets (RFC 5545 §3.1).
    assert.doesNotMatch(ics, /[^\r]\n|\r[^\n]/);
    for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  }), RUNS);
});

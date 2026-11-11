/**
 * The exact edges of cost and score computation, written after mutation
 * testing (npm run test:mutation) showed which changes to the code went
 * unnoticed: invalid server figures, the merge of page and server prices, the
 * exit fee in monthly payments, per-instalment extras, the "understated" flag
 * at exactly three times, the caps on weak or unanalysed results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { termsFromServer, mergePricing, penaltyFromFindings, computeCost } from '../src/core/consequence.js';
import { moneyPressure, compressSeverity, computeScore, shouldBlock } from '../src/core/scoring.js';
import { setLang } from '../src/i18n/index.js';

setLang('en');
const q = (value, quote = 'q') => ({ value, quote });

test('termsFromServer: only finite, non-negative figures; currency upper-cased to 3 letters; an unlabelled extra gets a label instead of crashing', () => {
  const t = termsFromServer({
    price: q(9.99, '€ 9,99'), currency: q('eur'), billing_period: q('month'),
    minimum_term_months: q(-12), notice_days: q(Infinity), exit_fee: q(0, 'no fee'),
    extra_fees: [null, { value: 0, label: 'Free' }, { value: NaN }, { value: 5, label: '  ', per_cycle: true, quote: '€5 per month' }, { value: 3, label: 'Setup', per_cycle: 'yes' }],
  });
  assert.equal(t.price, 9.99);
  assert.equal(t.priceQuote, '€ 9,99');
  assert.equal(t.currency, 'EUR');
  assert.equal(termsFromServer({ currency: q('euros') }).currency, 'EUR');
  assert.equal(termsFromServer({ currency: q(5) }).currency, null);
  assert.equal(t.minTerm, null, 'a negative term is no term');
  assert.equal(t.notice, null, 'an infinite notice is no notice');
  assert.deepEqual(t.penalty, { amount: 0, quote: 'no fee' }, 'zero is a real figure');
  assert.deepEqual(t.extras, [
    { amount: 5, label: 'Extra cost', perCycle: true, raw: '€5 per month' },
    { amount: 3, label: 'Setup', perCycle: false, raw: null },
  ]);
  assert.deepEqual(termsFromServer(null).extras, []);
  assert.equal(termsFromServer({ price: { value: '9.99' } }).price, null, 'a string is not a figure');
  assert.equal(termsFromServer({}).priceQuote, null);
});

test('mergePricing: the page wins; the server fills only what the page lacks', () => {
  assert.deepEqual(mergePricing({ amount: 20, period: 'month' }, { price: 9, period: 'year', currency: 'GBP' }), { amount: 20, period: 'month', currency: 'GBP', recurring: true });
  assert.deepEqual(mergePricing({}, { price: 9, period: 'year', currency: 'EUR' }), { amount: 9, period: 'year', source: 'server', currency: 'EUR', recurring: true });
  assert.deepEqual(mergePricing({}, { price: 49, period: 'once' }), { amount: 49, source: 'server' }, 'a one-off price is not recurring');
  assert.deepEqual(mergePricing({ period: 'month' }, { price: 9 }), { period: 'month', amount: 9, source: 'server', recurring: true });
  assert.deepEqual(mergePricing({ currency: 'USD' }, { currency: 'EUR' }), { currency: 'USD' });
  assert.deepEqual(mergePricing({ amount: 5, recurring: false, period: 'month' }, {}), { amount: 5, recurring: false, period: 'month' });
  assert.deepEqual(mergePricing(null, {}), {});
});

test('penaltyFromFindings: needs the exit-fee category and a quote; reads numbers in words', () => {
  assert.equal(penaltyFromFindings([]), null);
  assert.equal(penaltyFromFindings([{ category: 'no_refund', quote: 'tre mensilità' }]), null);
  assert.equal(penaltyFromFindings([{ category: 'early_termination_penalty' }]), null);
  assert.equal(penaltyFromFindings([{ category: 'early_termination_penalty', quote: 'a fee applies' }]), null);
  assert.equal(penaltyFromFindings([{ category: 'early_termination_penalty', quote: 'pari a dodici mensilità' }]).months, 12);
  assert.equal(penaltyFromFindings([{ category: 'early_termination_penalty', quote: 'pari a 12 mensilità' }]).months, 12);
  assert.equal(penaltyFromFindings([{ category: 'early_termination_penalty', quote: 'x 3a mensilità' }]), null, '"3a" is not a number of months');
});

test('computeCost: exit fee in months only for a monthly price; extras per instalment only with several cycles', () => {
  const base = { ctx: { pricing: { amount: 10, period: 'month' } } };
  const months = computeCost({ ...base, terms: { penalty: { months: 2 } } });
  assert.deepEqual(months.lines.find((l) => l.kind === 'penalty'), { label: 'Fee (2 monthly payments)', amount: 20, kind: 'penalty' });
  const yearly = computeCost({ ctx: { pricing: { amount: 100, period: 'year' } }, terms: { penalty: { months: 2 } } });
  assert.equal(yearly.lines.find((l) => l.kind === 'penalty').amount, null, 'months of a yearly price: amount unknown');
  assert.equal(yearly.uncertain, true);
  const once = computeCost({ ctx: { pricing: { amount: 10, period: 'month' } }, terms: { extras: [{ label: 'Fee', amount: 2, perCycle: true }, { label: 'Skip', amount: null }] } });
  assert.deepEqual(once.lines.map((l) => [l.kind, l.amount]), [['recurring', 10], ['extra', 2]], 'one cycle: the per-instalment fee once; a null extra is skipped');
  const many = computeCost({ ...base, terms: { minTerm: { months: 6, raw: '6' }, extras: [{ label: 'Fee', amount: 2, perCycle: true }] } });
  assert.equal(many.lines.find((l) => l.kind === 'extra').amount, 12);
  assert.equal(many.worstCase, 72);
});

test('computeCost: no lines, no worst case; the currency comes from the page, then the terms, then EUR', () => {
  const none = computeCost({});
  assert.equal(none.worstCase, null);
  assert.equal(none.worstCaseLabel, null);
  assert.equal(none.currency, 'EUR');
  assert.equal(computeCost({ terms: { currency: 'GBP' } }).currency, 'GBP');
  assert.equal(computeCost({ ctx: { pricing: { currency: 'USD' } }, terms: { currency: 'GBP' } }).currency, 'USD');
});

test('computeCost: "understated" from exactly three times the price shown', () => {
  const at = (months) => computeCost({ ctx: { pricing: { amount: 10, period: 'month' } }, terms: { minTerm: { months, raw: '' } } });
  assert.equal(at(3).understated, true, '3× is understated');
  assert.equal(at(2).understated, false);
  assert.equal(computeCost({ ctx: { pricing: {} }, terms: { penalty: { amount: 50 } } }).understated, false, 'no price shown: nothing to understate');
});

test('computeCost: uncertain without a stated term when it renews by itself', () => {
  const renew = computeCost({ ctx: { pricing: { amount: 10, period: 'month' } }, findings: [{ category: 'auto_renewal' }] });
  assert.equal(renew.uncertain, true);
  assert.equal(renew.horizonMonths, 12);
  const stated = computeCost({ ctx: { pricing: { amount: 10, period: 'month' } }, findings: [{ category: 'auto_renewal' }], terms: { minTerm: { months: 24, raw: '' } } });
  assert.equal(stated.uncertain, false);
});

test('moneyPressure and compressSeverity at their edges', () => {
  assert.equal(moneyPressure(0), 0);
  assert.equal(moneyPressure(-5), 0);
  assert.equal(moneyPressure(null), 0);
  assert.equal(moneyPressure(20), 0, 'log10(1) = 0');
  assert.equal(compressSeverity(50), 50, 'linear up to the knee, included');
  assert.ok(compressSeverity(51) > 50 && compressSeverity(51) <= 51);
});

test('computeScore: a single weak clue without cost stays below 45; an unanalysed page at most 30', () => {
  const weak = computeScore({ findings: [{ severity: 90, confidence: 0.5, category: 'x' }], actionType: 'manual' });
  assert.ok(weak.score <= 44, `score ${weak.score}`);
  const sure = computeScore({ findings: [{ severity: 90, confidence: 0.9, category: 'x' }], actionType: 'manual' });
  assert.ok(sure.score > 44, `score ${sure.score}`);
  const priced = computeScore({ findings: [{ severity: 90, confidence: 0.5, category: 'x' }], cost: { worstCase: 500 }, actionType: 'manual' });
  assert.ok(priced.score > 44, 'with a cost, one clue can weigh more');
  const unanalysed = computeScore({ findings: [{ severity: 90, confidence: 0.9 }, { severity: 90, confidence: 0.9 }], analyzed: false });
  assert.ok(unanalysed.score <= 30, `score ${unanalysed.score}`);
  assert.equal(computeScore({ actionType: 'nothing-known' }).components.floor, 0);
});

test('shouldBlock: unknown level or threshold never blocks; the threshold itself does', () => {
  assert.equal(shouldBlock('high_risk', 'high_risk'), true);
  assert.equal(shouldBlock('commitment', 'high_risk'), false);
  assert.equal(shouldBlock('critical'), true);
  assert.equal(shouldBlock('review'), false);
  assert.equal(shouldBlock('weird', 'review'), false);
  assert.equal(shouldBlock('critical', 'weird'), false);
});

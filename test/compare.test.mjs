/** Two contracts side by side: the rows of the table, the mark on the lighter one, the sentence above. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { compareRows, compareSummary, sameVerdict, contractName } from '../src/core/compare.js';
import { t, setLang } from '../src/i18n/index.js';

setLang('en');
const cost = (o = {}) => ({ currency: 'EUR', displayed: null, worstCase: null, worstCaseLabel: null, horizonMonths: null, minTerm: null, notice: null, penalty: null, extras: [], hasAutoRenewal: false, ...o });
const A = {
  host: 'fitclub.example', level: { label: 'Commitment' }, score: 62, headline: 'A',
  cost: cost({ displayed: '€19.99 / month', worstCase: 599.76, worstCaseLabel: '€599.76', minTerm: { months: 24, raw: '24 months' }, notice: { days: 60, raw: '60 days' }, penalty: { amount: 120 }, hasAutoRenewal: true }),
  findings: [{ category: 'auto_renewal', severity: 70, quote: 'q1' }, { category: 'minimum_term', severity: 65, quote: 'q2' }, { category: 'data', severity: 30, quote: 'q3' }],
};
const B = {
  host: 'gymbox.example', level: { label: 'Check' }, score: 35, headline: 'B',
  cost: cost({ displayed: '€24.99 / month', worstCase: 299.88, worstCaseLabel: '€299.88', minTerm: { months: 12, raw: '12 months' }, extras: [{ label: 'Activation', amount: 29 }] }),
  findings: [{ category: 'minimum_term', severity: 65, quote: 'q9' }],
};
const row = (rows, id) => rows.find((r) => r.id === id);

test('each row shows both sides and marks the lighter one', () => {
  const rows = compareRows(A, B, t);
  assert.deepEqual(rows.map((r) => r.id), ['level', 'price', 'total', 'term', 'renewal', 'notice', 'fee', 'extras', 'clauses']);
  assert.deepEqual([row(rows, 'total').a, row(rows, 'total').b, row(rows, 'total').better], ['€599.76', '€299.88', 'b']);
  assert.deepEqual([row(rows, 'term').a, row(rows, 'term').b, row(rows, 'term').better], ['24 months', '12 months', 'b']);
  assert.deepEqual([row(rows, 'renewal').a, row(rows, 'renewal').b, row(rows, 'renewal').better], ['yes', 'no', 'b']);
  assert.deepEqual([row(rows, 'notice').a, row(rows, 'notice').b, row(rows, 'notice').better], ['60 days', 'no', 'b']);
  assert.equal(row(rows, 'fee').better, 'b');
  assert.match(row(rows, 'fee').a, /120/);
  assert.equal(row(rows, 'extras').a, 'no');
  assert.match(row(rows, 'extras').b, /Activation.*29/);
  assert.equal(row(rows, 'extras').better, null, 'extras are listed, not judged: they are already in the total');
  assert.equal(row(rows, 'clauses').a, '3, of which 2 serious');
  assert.equal(row(rows, 'clauses').better, 'b');
  assert.equal(row(rows, 'level').better, 'b');
  assert.equal(row(rows, 'price').better, null, 'the price shown alone says little: no mark');
});

test('no mark when a side is unknown, equal, or in another currency', () => {
  const unknown = { ...B, cost: cost({}) , findings: [] };
  let rows = compareRows(A, unknown, t);
  assert.equal(row(rows, 'total').b, 'not stated');
  assert.equal(row(rows, 'total').better, null);
  rows = compareRows(A, A, t);
  assert.ok(rows.every((r) => r.better === null));
  const pounds = { ...B, cost: { ...B.cost, currency: 'GBP' } };
  rows = compareRows(A, pounds, t);
  assert.equal(row(rows, 'total').better, null);
  assert.equal(row(rows, 'fee').better, null);
  // A fee whose amount is not stated is not "less" than a stated one.
  const vague = { ...B, cost: { ...B.cost, penalty: { amount: null } } };
  assert.equal(row(compareRows(A, vague, t), 'fee').better, null);
  assert.doesNotThrow(() => compareRows(undefined, undefined, t));
});

test('the sentence above: who costs less, by how much, or why it cannot be said', () => {
  const names = { a: 'FitClub', b: 'GymBox' };
  assert.equal(compareSummary(A, B, names, t), '“GymBox” costs €299.88 less over the commitment.');
  assert.equal(compareSummary(B, A, { a: 'GymBox', b: 'FitClub' }, t), '“GymBox” costs €299.88 less over the commitment.');
  assert.equal(compareSummary(A, A, names, t), 'Over the commitment they cost the same.');
  assert.match(compareSummary(A, { ...B, cost: cost({}) }, names, t), /cannot be compared/);
  assert.match(compareSummary(A, { ...B, cost: { ...B.cost, currency: 'GBP' } }, names, t), /cannot be compared/);
});

test('a result is not compared with itself; names come from the seller', () => {
  assert.ok(sameVerdict(A, structuredClone(A)));
  assert.ok(!sameVerdict(A, B));
  assert.ok(!sameVerdict(A, null));
  // A name given after the contract was put aside does not make it another contract.
  assert.ok(sameVerdict({ ...A, host: '' }, { ...A, host: '', title: 'FitClub' }));
  assert.equal(contractName({ title: 'Palestra Orizzonte' }, 'First contract'), 'Palestra Orizzonte');
  assert.equal(contractName(A, 'First contract'), 'Fitclub');
  assert.equal(contractName({ title: 'page1.jpg' }, 'First contract'), 'First contract');
});

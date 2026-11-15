/**
 * Two contracts side by side: the same figures and ties the panel shows for
 * each, in two columns, with a mark on the lighter one where "lighter" has a
 * plain meaning (it costs less, it binds for less time).
 *
 * Nothing new is asked of the server: both verdicts are what the person has
 * already read. They stay in the browser's local storage, under one key.
 * A comparison of figures, not advice: the page says so.
 */
import { formatMoney } from './text.js';
import { providerName } from './commitments.js';

const KEY = 'compare';
const PAGE = 'src/compare/compare.html';

/** The verdict put aside as the first of the two: { verdict, at } or null. */
export async function readCompare() {
  const got = await chrome.storage.local.get(KEY);
  return got?.[KEY] || null;
}

/** Puts `verdict` aside as the first contract; a second one already there is dropped. */
export async function saveCompareBase(verdict, now = Date.now()) {
  await chrome.storage.local.set({ [KEY]: { a: { verdict, at: now } } });
}

export async function clearCompare() {
  await chrome.storage.local.remove(KEY);
}

/** Stores `verdict` as the second contract and opens the comparison page. */
export async function openCompare(verdict, now = Date.now()) {
  const cur = await readCompare();
  if (!cur?.a) throw new Error('nothing to compare with');
  await chrome.storage.local.set({ [KEY]: { ...cur, b: { verdict, at: now } } });
  await chrome.tabs.create({ url: chrome.runtime.getURL(PAGE) });
}

/** Are these the same analysis? (The same result must not be compared with itself.) */
export function sameVerdict(a, b) {
  const sig = (v) => JSON.stringify([v?.host || '', v?.title || '', v?.headline || '', v?.cost?.worstCase ?? null, (v?.findings || []).map((f) => f.quote || f.category)]);
  return Boolean(a && b) && sig(a) === sig(b);
}

/** What to call a contract in the table: the seller if known, the title, or "First/Second contract". */
export function contractName(verdict, fallback) {
  return providerName(verdict || {}) || fallback;
}

const SERIOUS = 60;

/**
 * The rows of the table. Each: `{ id, label, a, b, better }`, where `better`
 * is 'a', 'b' or null — null whenever one side is unknown or the two are equal.
 * `t` translates; values are plain text.
 */
export function compareRows(a, b, t) {
  const ca = a?.cost || {}, cb = b?.cost || {};
  const unknown = t('compareNotStated');
  const lower = (x, y) => (x == null || y == null || x === y ? null : x < y ? 'a' : 'b');
  const sameCurrency = (ca.currency || 'EUR') === (cb.currency || 'EUR');

  const term = (c) => (c.minTerm?.months ? c.minTerm.raw : c.horizonMonths ? t('nMonths', { n: c.horizonMonths }) : t('compareNo'));
  const termMonths = (c) => c.minTerm?.months ?? c.horizonMonths ?? 0;
  const notice = (c) => (c.notice?.days ? c.notice.raw : t('compareNo'));
  const fee = (c) => (!c.penalty ? t('compareNo') : c.penalty.amount != null ? formatMoney(c.penalty.amount, c.currency) : t('feeNotStated'));
  const feeAmount = (c) => (!c.penalty ? 0 : c.penalty.amount ?? null);
  const extras = (c) => ((c.extras || []).length ? c.extras.map((e) => `${e.label} ${formatMoney(e.amount, c.currency)}`).join(', ') : t('compareNo'));
  const clauses = (v) => {
    const all = v?.findings || [];
    const serious = all.filter((f) => (f.severity ?? 0) >= SERIOUS).length;
    return all.length ? t('compareNClausesMSerious', { n: all.length, m: serious }) : t('compareNo');
  };
  const seriousCount = (v) => (v?.findings || []).filter((f) => (f.severity ?? 0) >= SERIOUS).length;

  return [
    { id: 'level', label: t('compareLevel'), a: a?.level?.label || unknown, b: b?.level?.label || unknown, better: lower(a?.score, b?.score) },
    { id: 'price', label: t('comparePrice'), a: ca.displayed || unknown, b: cb.displayed || unknown, better: null },
    {
      id: 'total', label: t('compareTotalCost'), a: ca.worstCaseLabel || unknown, b: cb.worstCaseLabel || unknown,
      better: sameCurrency ? lower(ca.worstCase, cb.worstCase) : null,
    },
    { id: 'term', label: t('compareMinimumTerm'), a: term(ca), b: term(cb), better: lower(termMonths(ca), termMonths(cb)) },
    {
      id: 'renewal', label: t('automaticRenewal'), a: ca.hasAutoRenewal ? t('compareYes') : t('compareNo'), b: cb.hasAutoRenewal ? t('compareYes') : t('compareNo'),
      better: Boolean(ca.hasAutoRenewal) === Boolean(cb.hasAutoRenewal) ? null : ca.hasAutoRenewal ? 'b' : 'a',
    },
    { id: 'notice', label: t('compareNotice'), a: notice(ca), b: notice(cb), better: lower(ca.notice?.days ?? 0, cb.notice?.days ?? 0) },
    { id: 'fee', label: t('earlyTerminationFee'), a: fee(ca), b: fee(cb), better: sameCurrency ? lower(feeAmount(ca), feeAmount(cb)) : null },
    { id: 'extras', label: t('compareExtras'), a: extras(ca), b: extras(cb), better: null },
    { id: 'clauses', label: t('compareClauses'), a: clauses(a), b: clauses(b), better: lower(seriousCount(a), seriousCount(b)) },
  ];
}

/** The sentence above the table: which one costs less over the commitment, when that can be said. */
export function compareSummary(a, b, names, t) {
  const ca = a?.cost || {}, cb = b?.cost || {};
  if (ca.worstCase == null || cb.worstCase == null || (ca.currency || 'EUR') !== (cb.currency || 'EUR')) return t('compareCannotCost');
  if (ca.worstCase === cb.worstCase) return t('compareSameCost');
  const cheaper = ca.worstCase < cb.worstCase ? names.a : names.b;
  return t('compareXCostsLess', { x: cheaper, y: formatMoney(Math.abs(ca.worstCase - cb.worstCase), ca.currency) });
}

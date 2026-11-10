/**
 * Proof of what you accepted.
 *
 * When the user goes ahead, a fingerprint of the exact text they were
 * accepting is recorded: SHA-256 hash, date, excerpt, and the verdict's numbers.
 *
 * It serves two very concrete purposes:
 *  - six months later, when the provider claims you had accepted something
 *    else, you have that day's snapshot;
 *  - when the terms change, the comparison doesn't say "the terms changed" —
 *    useless information — but "your commitment went from €239.88 to
 *    €479.76".
 */

import { normalize, formatMoney } from './text.js';
import { t, locale } from '../i18n/index.js';

const MAX_STORED_CHARS = 200_000;

/**
 * Below this threshold there is nothing to attest. The case that matters is
 * not short text but *missing* text: the SHA-256 of the empty string matches
 * itself, so verification answered "✓ the stored text matches the
 * fingerprint" on a proof that contained nothing.
 */
const MIN_PROOF_CHARS = 40;

/** SHA-256 in hex. Available both in the service worker and in Node. */
export async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the snapshot to keep.
 *
 * @param {object} p
 * @param {string} p.text     Accepted text.
 * @param {object} p.verdict  Verdict computed on that text.
 * @param {number} [p.now]
 */
export async function createSnapshot({ text = '', verdict = {}, now = Date.now() } = {}) {
  const clean = normalize(text);
  const hash = await sha256(clean);

  return {
    hash,
    at: new Date(now).toISOString(),
    /** Without text the fingerprint attests nothing: whoever uses it must know. */
    empty: clean.length < MIN_PROOF_CHARS,
    chars: clean.length,
    truncated: clean.length > MAX_STORED_CHARS,
    excerpt: clean.slice(0, 600),
    /** The full text stays local: it is the actual proof. */
    text: clean.slice(0, MAX_STORED_CHARS),
    url: verdict.url || null,
    termsUrl: verdict.termsUrl || null,
    /** A snapshot of the numbers, for later comparison. */
    verdict: {
      score: verdict.score ?? null,
      level: verdict.level?.id ?? null,
      worstCase: verdict.cost?.worstCase ?? null,
      currency: verdict.cost?.currency ?? 'EUR',
      recurringAmount: findRecurring(verdict.cost),
      horizonMonths: verdict.cost?.horizonMonths ?? null,
      noticeMonths: verdict.cost?.notice?.months ?? null,
      categories: (verdict.findings || []).map((f) => f.category).sort(),
      headline: verdict.headline || null,
    },
  };
}

function findRecurring(cost) {
  const line = (cost?.lines || []).find((l) => l.kind === 'recurring');
  if (!line || !cost?.horizonMonths) return null;
  return null; // the unit fee is in ctx.pricing, not in the aggregated lines
}

/**
 * Compares the stored snapshot with a new analysis of the same terms.
 *
 * @returns {{changed:boolean, hashChanged:boolean, costDelta:number|null, summary:string, added:string[], removed:string[], severity:'none'|'minor'|'major'}}
 */
export function compareSnapshot(snapshot, { text = '', verdict = {}, newHash = null } = {}) {
  const oldV = snapshot?.verdict || {};
  const hashChanged = Boolean(newHash) && newHash !== snapshot?.hash;

  const oldCats = new Set(oldV.categories || []);
  const newCats = new Set((verdict.findings || []).map((f) => f.category));
  const added = [...newCats].filter((c) => !oldCats.has(c)).sort();
  const removed = [...oldCats].filter((c) => !newCats.has(c)).sort();

  const oldCost = oldV.worstCase ?? null;
  const newCost = verdict.cost?.worstCase ?? null;
  const costDelta = oldCost != null && newCost != null ? round2(newCost - oldCost) : null;
  const currency = verdict.cost?.currency || oldV.currency || 'EUR';

  const scoreDelta = oldV.score != null && verdict.score != null ? verdict.score - oldV.score : null;

  const changed = hashChanged || added.length > 0 || removed.length > 0 || Boolean(costDelta);

  // A change is "major" when it touches the wallet or adds a category that
  // weighs: the case where it is worth disturbing the user.
  const heavy = ['auto_renewal', 'minimum_term', 'early_termination_penalty', 'no_refund', 'price_change', 'ip_assignment', 'data_sale', 'arbitration'];
  const severity = !changed
    ? 'none'
    : (costDelta && Math.abs(costDelta) >= Math.max(10, (oldCost || 0) * 0.1)) ||
      added.some((c) => heavy.includes(c))
      ? 'major'
      : 'minor';

  return {
    changed,
    hashChanged,
    added,
    removed,
    costDelta,
    scoreDelta,
    severity,
    summary: describe({ changed, costDelta, currency, oldCost, newCost, added, removed, hashChanged }),
    checkedAt: new Date().toISOString(),
  };
}

function describe({ changed, costDelta, currency, oldCost, newCost, added, removed, hashChanged }) {
  if (!changed) return t('termsIdenticalOnesAccepted');

  const bits = [];
  if (costDelta && oldCost != null && newCost != null) {
    const vars = { a: formatMoney(oldCost, currency), b: formatMoney(newCost, currency), d: (costDelta > 0 ? '+' : '') + formatMoney(costDelta, currency) };
    bits.push(costDelta > 0
      ? t('potentialCommitmentWentUpFromB', vars)
      : t('potentialCommitmentWentDownFromB', vars));
  }
  if (added.length) bits.push(t('newTermsN', { n: added.length }));
  if (removed.length) bits.push(t('removedTermsN', { n: removed.length }));
  if (!bits.length && hashChanged) bits.push(t('textChangedButRelevantTermsLook'));
  return bits.join(' ');
}

/**
 * A readable attestation line, to attach to a complaint.
 * It is not a certification: it is a statement of what your browser read at
 * that moment, with the fingerprint that makes it verifiable.
 */
export function attestation(snapshot, { host } = {}) {
  const d = new Date(snapshot.at);
  return [
    t('contentStatementGeneratedLocallyAntefirma'),
    '',
    `${t('source')} ${snapshot.url || host || '—'}`,
    `${t('dateTime')} ${d.toLocaleString(locale())} (${snapshot.at})`,
    `${t('textLength')} ${t('nCharacters', { n: snapshot.chars })}`,
    `${t('sha256Fingerprint')} ${snapshot.hash}`,
    '',
    t('fullTextMatchingFingerprintStoredLocally'),
    '',
    t('statementNotCertificationIndependentLegalValue'),
  ].join('\n');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

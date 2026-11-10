/** Re-reading accepted terms and comparing them with what was accepted. */
import { analyze } from '../core/analyzer.js';
import { ACTION_TYPES } from '../core/constants.js';
import { htmlToText, normalize } from '../core/text.js';
import { compareSnapshot, sha256 } from '../core/proof.js';
import { COMMITMENT_STATUS } from '../core/commitments.js';
import { t } from '../i18n/index.js';
import { getCommitments, getCommitment, updateCommitment } from '../core/storage.js';
import { notify } from './commitments.js';
import { ANALYSIS_BUDGET_MS, MAX_TERMS_BYTES, getSettings } from './settings.js';

/**
 * Re-reads the terms already accepted and compares.
 * The useful message is not "the terms changed" — which says nothing — but
 * "your commitment went from €239.88 to €479.76".
 */
export async function checkChanges(id, { trigger = 'manual' } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('commitmentNotFound'));

  const source = commitment.termsUrl || commitment.url;
  if (!source) throw new Error(t('noAddressReCheckWasSaved'));

  const settings = await getSettings();

  // ── Gate 1: the network. Almost free. ────────────────────────────────────
  // If the server answers 304 the document is identical and nothing was
  // transferred: stop here, without reading, analysing or spending.
  const doc = await fetchDocument(source, commitment.http || {});
  if (doc.notModified) {
    return recordCheck(id, unchangedDiff(t('documentHasnTChangedSinceLast')), commitment);
  }
  if (!doc.text || doc.text.length < 200) {
    throw new Error(t('documentCanNoLongerReadAutomatically'));
  }
  if (doc.http) await updateCommitment(id, { http: doc.http });

  // ── Gate 2: the fingerprint. Free, all local. ────────────────────────────
  const clean = normalize(doc.text);
  const newHash = await sha256(clean);
  if (commitment.snapshot?.hash && newHash === commitment.snapshot.hash) {
    return recordCheck(id, unchangedDiff(t('termsIdenticalOnesAccepted')), commitment);
  }

  // ── Gate 3: the server. ──────────────────────────────────────────────────
  // A different hash doesn't mean *your commitment* changed: a copyright year
  // or a counter is enough. What matters are the derived facts — cost, term,
  // notice, penalty, categories — and getting them needs the analysis. The
  // document is the public one you accepted; the server remembers analyses by
  // text fingerprint, so the same terms read by many people are analysed once.
  //
  // A check that starts by itself only asks the server if the option is on and
  // consent was given; otherwise it only says the text changed, without
  // notifying.
  const snapshot = { ...(commitment.snapshot || {}), verdict: snapshotVerdict(commitment) };
  // The same economic context as the original analysis: comparing a verdict
  // computed with the price against one computed without it is a guaranteed
  // false alarm, and a reassuring one too — it would report a non-existent drop.
  const recheckCtx = {
    url: source,
    title: commitment.title,
    pricing: commitment.pricing || {},
    terms: { textInPage: true },
  };

  const serverAllowed = Boolean(settings.remoteConsentAt) && (trigger === 'manual' || settings.watchUsesRemote !== false);
  if (!serverAllowed) {
    return recordCheck(id, {
      ...unchangedDiff(t('textTermsHasChangedPressCheck')),
      changed: true,
      hashChanged: true,
      severity: 'minor',
    }, commitment);
  }

  let better;
  try {
    better = await analyze({
      text: clean,
      ctx: recheckCtx,
      actionType: commitment.actionType || ACTION_TYPES.ACCEPT_TERMS,
      settings,
      signal: AbortSignal.timeout(ANALYSIS_BUDGET_MS),
    });
  } catch (err) {
    if (trigger === 'manual') throw err;
    // An automatic check that fails is repeated at the next pass.
    return commitment;
  }
  const diff = { ...compareSnapshot(snapshot, { text: clean, verdict: better, newHash }), escalated: true };

  if (diff.severity !== 'major') {
    return recordCheck(id, diff, commitment);
  }

  const saved = await recordCheck(id, diff, commitment);

  await notify({
    id: `change-${id}-${Date.now()}`,
    title: t('termsChangedX', { x: commitment.provider || commitment.host }),
    message: diff.summary,
    commitmentId: id,
  });

  return saved;
}

export function unchangedDiff(summary) {
  return {
    changed: false, hashChanged: false, added: [], removed: [],
    costDelta: null, scoreDelta: null, severity: 'none',
    summary, escalated: false, checkedAt: new Date().toISOString(),
  };
}

export async function recordCheck(id, diff, commitment) {
  const changes = [...(commitment.changes || []), diff].slice(-10);
  await updateCommitment(id, { changes, lastCheck: new Date().toISOString() });
  return diff;
}

/** Rebuilds the snapshot of numbers kept in the commitment. */
export function snapshotVerdict(commitment) {
  return {
    score: commitment.score,
    level: commitment.level,
    worstCase: commitment.worstCase,
    currency: commitment.currency,
    horizonMonths: commitment.horizonMonths,
    noticeMonths: commitment.noticeMonths,
    categories: (commitment.categories || []).slice().sort(),
    headline: commitment.headline,
  };
}

export async function watchAllCommitments() {
  const settings = await getSettings();
  if (!settings.watchChanges) return;

  const list = await getCommitments();
  for (const c of list) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) continue;
    if (!c.termsUrl && !c.url) continue;
    try {
      await checkChanges(c.id, { trigger: 'scheduled' });
    } catch {
      /* an unreachable site must not stop the others */
    }
  }
}

/**
 * @param {string} url
 * @param {{etag?: string, lastModified?: string}} [validators]
 *        When given, the request becomes conditional: a 304 means
 *        "identical" without transferring a byte. It is the cheapest check
 *        there is, and it also reduces the load on the site we are asking.
 */
export async function fetchDocument(url, validators = {}, { signal } = {}) {
  if (!url) throw new Error('URL mancante.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(t('unsupportedProtocol'));
  }

  const headers = {};
  if (validators.etag) headers['if-none-match'] = validators.etag;
  if (validators.lastModified) headers['if-modified-since'] = validators.lastModified;

  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', headers, signal });
  if (res.status === 304) {
    return { url, notModified: true, text: '', http: validators };
  }
  if (!res.ok) throw new Error(t('documentCanTReachedHttpN', { n: res.status }));

  const http = {
    etag: res.headers.get('etag') || null,
    lastModified: res.headers.get('last-modified') || null,
  };

  const type = res.headers.get('content-type') || '';
  if (type.includes('application/pdf')) {
    return { url: res.url, isPdf: true, text: '', note: t('pdfOpenSidePanelAnalyse') };
  }

  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_TERMS_BYTES ? buf.slice(0, MAX_TERMS_BYTES) : buf;
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  const text = type.includes('text/plain') ? normalize(raw) : htmlToText(raw);

  return { url: res.url, isPdf: false, text, chars: text.length, http, truncated: buf.byteLength > MAX_TERMS_BYTES };
}

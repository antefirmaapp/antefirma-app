/** Analyses: intercepted actions, text from the panel, examples; data export and import. */
import { analyze } from '../core/analyzer.js';
import { shouldBlock } from '../core/scoring.js';
import { ACTION_TYPES } from '../core/constants.js';
import { normalize } from '../core/text.js';
import { SAMPLES } from '../core/samples.js';
import { t } from '../i18n/index.js';
import { isAllowlisted, getCached, setCached, pushHistory } from '../core/storage.js';
import { fetchDocument } from './changes.js';
import { ANALYSIS_BUDGET_MS, TERMS_FETCH_BUDGET_MS, cacheKey, failure, getSettings, showQuotaBadge, updateBadge } from './settings.js';

export async function analyzeAction(payload = {}, sender) {
  const settings = await getSettings();
  const ctx = payload.ctx || {};
  ctx.url = ctx.url || sender?.tab?.url || sender?.url;
  ctx.title = ctx.title || sender?.tab?.title;

  if (!settings.enabled || isAllowlisted(ctx.url, settings)) {
    return { skip: true, reason: settings.enabled ? 'allowlist' : 'disabled' };
  }

  let text = normalize(payload.text || '');
  let termsSource = ctx.terms?.textInPage ? 'page' : null;

  if (text.length < 800 && ctx.terms?.url) {
    const fetched = await fetchDocument(ctx.terms.url, {}, {
      signal: AbortSignal.timeout(TERMS_FETCH_BUDGET_MS),
    }).catch(() => null);
    if (fetched?.text) {
      text = `${text}\n\n${fetched.text}`.trim();
      termsSource = 'fetched';
      ctx.terms = { ...ctx.terms, fetched: true, fetchedChars: fetched.text.length };
    }
  }

  if (!settings.remoteConsentAt) return { needsConsent: true };

  const key = cacheKey(text, payload.actionType, settings);
  let verdict = await getCached(key, settings.cacheTtlHours);
  const cached = Boolean(verdict);

  if (!verdict) {
    try {
      verdict = await analyze({
        text,
        ctx,
        actionType: payload.actionType || ACTION_TYPES.ACCEPT_TERMS,
        settings,
        signal: AbortSignal.timeout(ANALYSIS_BUDGET_MS),
      });
    } catch (err) {
      console.warn('[AnteFirma] analisi non riuscita', err?.code, err?.detail || err);
      return failure(err);
    }
    await setCached(key, verdict);
  }

  verdict = { ...verdict, cached, termsSource };
  let blocking = shouldBlock(verdict.level.id, settings.blockFrom);
  // "Only block above … €": a small commitment doesn't interrupt, except critical cases.
  const minAmount = Number(settings.minBlockAmount) || 0;
  if (blocking && minAmount > 0 && verdict.level.id !== 'critical' && verdict.cost?.worstCase != null && verdict.cost.worstCase < minAmount) blocking = false;

  const id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  await pushHistory(
    {
      id,
      at: verdict.createdAt,
      host: verdict.host,
      url: verdict.url,
      title: verdict.title,
      actionType: verdict.actionType,
      score: verdict.score,
      level: verdict.level.id,
      headline: verdict.headline,
      worstCase: verdict.cost?.worstCase ?? null,
      currency: verdict.cost?.currency ?? null,
      mustRemember: verdict.mustRemember,
      deadline: verdict.timeline?.find((s) => s.kind === 'deadline')?.at || null,
      decision: null,
    },
    settings.historyLimit
  );

  // The full verdict stays available for the moment of decision: if the user
  // goes ahead, the recorded commitment is born from here.
  await chrome.storage.session.set({ [`verdict:${id}`]: { verdict, text } });

  await updateBadge(sender?.tab?.id, verdict.level);
  await showQuotaBadge(verdict.engine?.quota);

  const proceedCount = verdict.host ? ((await chrome.storage.local.get('proceedByHost')).proceedByHost?.[verdict.host] || 0) : 0;
  return { skip: false, blocking, verdict: { ...verdict, historyId: id, proceedCount } };
}

/** Analysis started from the side panel (paste, PDF, page, URL). */
export async function analyzeText(payload = {}) {
  const settings = await getSettings();
  const text = normalize(payload.text || '');
  if (text.length < 40) throw new Error(t('textTooShortMeaningfulAnalysis'));

  const ctx = {
    url: payload.url || null,
    title: payload.title || null,
    pricing: payload.pricing || {},
    terms: { textInPage: true },
    ...(payload.ctx || {}),
  };

  if (!settings.remoteConsentAt) return { needsConsent: true };

  const actionType = payload.actionType || ACTION_TYPES.MANUAL;
  const key = cacheKey(text, actionType, settings);

  if (!payload.force) {
    const cached = await getCached(key, settings.cacheTtlHours);
    if (cached) return { ...cached, cached: true };
  }

  // From the panel the error bubbles up as an exception: the panel shows the message.
  const verdict = await analyze({
    text, ctx, actionType, settings,
    signal: AbortSignal.timeout(ANALYSIS_BUDGET_MS),
  });
  await setCached(key, verdict);

  // Manual analyses can become commitments to watch, too.
  const id = `manual-${Date.now().toString(36)}`;
  await chrome.storage.session.set({ [`verdict:${id}`]: { verdict, text } });
  await showQuotaBadge(verdict.engine?.quota);
  return { ...verdict, historyId: id };
}

/**
 * An example: the same computation as a real analysis, with the server's answer
 * already written. No text leaves the computer, no analysis is used, and the
 * result cannot be recorded as a commitment (it is not your contract).
 */
export async function analyzeSample(key) {
  const sample = SAMPLES[key];
  if (!sample) throw new Error(t('exampleNotFound'));
  const settings = await getSettings();
  const lang = sample.langs[settings.uiLang] ? settings.uiLang : 'it';
  const s = sample.langs[lang];
  const verdict = await analyze({
    text: s.text,
    ctx: { pricing: sample.pricing || {}, terms: { textInPage: true } },
    actionType: sample.pricing?.period ? ACTION_TYPES.SUBSCRIBE : ACTION_TYPES.MANUAL,
    settings,
    remote: async () => ({ findings: s.findings, terms: s.terms, summary: s.summary, dropped: 0, truncated: false, model: 'esempio' }),
  });
  return { ...verdict, example: true, text: s.text };
}

/** The keys a backup carries: never the installation identity or the licence. */
export const EXPORT_KEYS = ['settings', 'history', 'commitments', 'snapshots', 'proceedByHost'];

export async function exportData() {
  const data = await chrome.storage.local.get(EXPORT_KEYS);
  if (data.settings) delete data.settings.remoteConsentAt; // consent is given in each installation
  return { app: 'antefirma', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Merges a backup: adds what is missing, deletes nothing that is there. */
export async function importData(file) {
  if (!file || file.app !== 'antefirma' || typeof file.data !== 'object') throw new Error(t('fileNotAntefirmaBackup'));
  const cur = await chrome.storage.local.get(EXPORT_KEYS);
  const byId = (a = [], b = []) => {
    const seen = new Set(a.map((x) => x.id ?? x.at));
    return [...a, ...b.filter((x) => !seen.has(x.id ?? x.at))];
  };
  const d = file.data;
  const next = {
    commitments: byId(cur.commitments || [], Array.isArray(d.commitments) ? d.commitments : []),
    history: byId(cur.history || [], Array.isArray(d.history) ? d.history : []),
    snapshots: { ...(d.snapshots || {}), ...(cur.snapshots || {}) },
    proceedByHost: { ...(d.proceedByHost || {}), ...(cur.proceedByHost || {}) },
    // Preferences and letter details come from the backup; consent stays this installation's.
    settings: { ...(cur.settings || {}), ...(d.settings || {}), remoteConsentAt: cur.settings?.remoteConsentAt || null },
  };
  await chrome.storage.local.set(next);
  return {
    commitments: next.commitments.length - (cur.commitments || []).length,
    history: next.history.length - (cur.history || []).length,
  };
}

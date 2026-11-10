/** Settings with the language resolved, consent, small helpers shared by the background modules. */
import { hashText } from '../core/text.js';
import { ServerError } from '../core/server.js';
import { API_BASE } from '../core/config.js';
import { t, setLang, resolveLang } from '../i18n/index.js';
import { getSettings as readSettings, setSettings, clearCache } from '../core/storage.js';

export const MAX_TERMS_BYTES = 1_500_000;

/**
 * Settings with the language already resolved ("auto" → browser language), which
 * is also the language of the texts produced here: verdicts, notifications, menus.
 */
export async function getSettings() {
  const s = await readSettings();
  return { ...s, uiLang: setLang(resolveLang(s.uiLang, chrome.i18n?.getUILanguage?.())) };
}

/**
 * Maximum duration of an analysis, and of downloading the terms alone.
 *
 * The click is held and the page is covered by the warning: if the model API
 * doesn't answer, the user is left facing an endless hourglass, with only two
 * ways out — go back or go ahead blindly. `analyze()` already accepted an
 * AbortSignal and passed it down to fetch, but none was ever created in the
 * whole project: it was always undefined.
 *
 * When time runs out the warning says the analysis failed and lets the user
 * choose: there is no fallback verdict to show, and faking one would be worse.
 */
export const ANALYSIS_BUDGET_MS = 15_000;

export const TERMS_FETCH_BUDGET_MS = 6_000;

/** The subset of settings a content script really needs. */
export async function contentSettings() {
  const s = await getSettings();
  return {
    enabled: s.enabled,
    allowlist: s.allowlist || [],
    blockFrom: s.blockFrom,
    uiLang: s.uiLang,
  };
}

/**
 * Adds a domain to the allowlist. A dedicated message instead of a generic
 * `SET_SETTINGS`: the content script must be able to do this one thing only.
 */
export async function allowlistAdd(host) {
  const clean = String(host || '').trim().toLowerCase().replace(/^www\./, '');
  if (!clean || !/^[a-z0-9.-]+$/.test(clean)) throw new Error(t('invalidDomain'));
  const s = await getSettings();
  const allowlist = [...new Set([...(s.allowlist || []), clean])];
  await setSettings({ allowlist });
  return { allowlist };
}

/**
 * Versions up to 0.4 sent the text straight to Anthropic or OpenAI with the
 * person's own key. With the move to the server, who receives the text changed:
 * consent given then doesn't cover this, and the key is no longer needed and
 * must not stay on disk.
 */
export async function forgetOldEngine() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || !('apiKey' in settings || 'provider' in settings)) return;
  const { apiKey, provider, model, useLLM, llmThreshold, useLocalModel, speculative, ...rest } = settings;
  await chrome.storage.local.set({ settings: { ...rest, remoteConsentAt: null } });
  await clearCache();
}

/**
 * Consent to send the text to the server. It is asked at the first analysis,
 * inside the warning or in the panel: the Chrome Web Store wants an explanation
 * in the interface and an explicit act before anything leaves the browser.
 * The date also tells who accepted which version of the practices.
 */
export async function grantConsent() {
  const remoteConsentAt = new Date().toISOString();
  await setSettings({ remoteConsentAt });
  return { remoteConsentAt };
}

/** Turns a server error into an answer for the interface. */
export function failure(err) {
  if (err instanceof ServerError) return { error: { code: err.code, message: err.message, retryAfter: err.retryAfter } };
  return { error: { code: 'internal', message: t('analysisFailed3') } };
}

/**
 * The badge used to show the free analyses left. Tabs with a verdict show their
 * level: that applies only to that tab.
 */
export async function showQuotaBadge(quota) {
  if (!chrome.action?.setBadgeText) return;
  // Analyses left are shown in the panel: a red number on the icon looks like an error or a notification.
  // Here we only clear what earlier versions wrote.
  void quota;
  try { await chrome.action.setBadgeText({ text: '' }); } catch { /* no icon to update */ }
}

/** Server errors reach the page as { error, message }, not as exceptions. */
export async function withCode(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ServerError) return { error: err.code, message: err.message };
    throw err;
  }
}

export async function serverStatus() {
  try {
    const res = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function updateBadge(tabId, level) {
  if (!tabId || !chrome.action?.setBadgeText) return;
  const text = { safe: '', review: '!', commitment: '!!', high_risk: '!!!', critical: '⛔' }[level.id] ?? '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: level.color });
  } catch { /* the tab may already be closed */ }
}

export function cacheKey(text, actionType, settings) {
  return `${hashText(text)}|${actionType}|${settings.jurisdiction}|${settings.uiLang || 'it'}|${profileKey(settings.profile)}`;
}

export function profileKey(profile = {}) {
  return Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(',');
}

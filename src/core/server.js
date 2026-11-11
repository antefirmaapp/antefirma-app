/**
 * The AnteFirma server client.
 *
 * It runs **only in the service worker**: the extension's permissions apply
 * there, and the page sees neither the token nor the responses. The server
 * keeps the model key; the extension only has a token that identifies the
 * installation — not the person — and expires after 90 days.
 *
 * Everything that comes from the server is text written by a model that read
 * someone else's page: show it as text, never as HTML.
 */

import { API_BASE } from './config.js';
import { t } from '../i18n/index.js';

const AUTH_KEY = 'antefirmaAuth';

/** The actions the server knows, from the extension's action types. */
const ACTION_MAP = {
  accept_terms: 'accept',
  subscribe: 'subscribe',
  purchase: 'purchase',
  sign: 'sign',
  signup: 'register',
  consent: 'consent',
  oauth: 'consent',
  manual: 'other',
};

/** The country to send to the server, from the jurisdiction in settings. */
const COUNTRY_MAP = { IT: 'IT', ES: 'ES', DE: 'DE', AT: 'AT', FR: 'FR', BE: 'BE', NL: 'NL', UK: 'GB', US: 'US' };

/**
 * A server error with the code that decides what to do.
 * `message` is for the user (the extension's own text, never the server's).
 */
export class ServerError extends Error {
  constructor(code, { status = 0, retryAfter = null, detail = '' } = {}) {
    super(messageFor(code));
    this.name = 'ServerError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.detail = detail;
  }
}

const MESSAGES = {
  quota: 'veUsedAllTodaySAnalyses',
  quota_month: 'veUsedMonthSAnalysesCount',
  quota_day: 'veUsedPlanSAnalysesToday',
  key_format: 'keyLooksLikeAfXxxxXxxx',
  key_unknown: 'unknownKeyCheckCopiedAll',
  key_admin: 'teamAdministratorKeyHereNeedSeat',
  key_inactive: 'keySLicenceNotActive',
  activations: 'keyAlreadyActiveMaximumNumberBrowsers',
  billing_off: 'paidPlansNotActiveYet',
  paused: 'freeAnalysesPausedTodayTheyResume',
  timeout: 'analysisTookTooLong',
  network: 'antefirmaServerCanTReachedCheck',
  busy: 'serviceVeryBusyRightNowTry',
  capacity: 'serviceHasReachedTodaySLimit',
  disabled: 'serviceDownMaintenance',
  revoked: 'installationHasBeenDisabledReinstallExtension',
  origin: 'serverDoesnTRecogniseVersionExtension',
  size: 'pageTooLongAnalyse',
  upstream: 'analysisFailedTryAgainShortly',
};

function messageFor(code) {
  return t(MESSAGES[code] || 'analysisFailed3');
}

// ── installation token ──────────────────────────────────────────────────────

async function readAuth(storage) {
  const got = await storage.get(AUTH_KEY);
  return got?.[AUTH_KEY] || {};
}

async function writeAuth(storage, patch) {
  const current = await readAuth(storage);
  await storage.set({ [AUTH_KEY]: { ...current, ...patch } });
}

/** The installation's random id: generated once, kept locally. */
export async function installId({ storage = chrome.storage.local } = {}) {
  const auth = await readAuth(storage);
  if (auth.installId) return auth.installId;
  const id = crypto.randomUUID();
  await writeAuth(storage, { installId: id });
  return id;
}

/** Asks the server for a new token with the same installation id. */
export async function register({ storage = chrome.storage.local, fetchImpl = fetch, base = API_BASE } = {}) {
  const id = await installId({ storage });
  const res = await call(fetchImpl, `${base}/v1/register`, { installId: id });
  const body = await readJson(res);
  if (!res.ok || !body?.token) throw errorFrom(res, body);
  await writeAuth(storage, { token: body.token, registeredAt: new Date().toISOString() });
  return body.token;
}

async function token(opts) {
  const auth = await readAuth(opts.storage);
  return auth.token || register(opts);
}

// ── analysis ────────────────────────────────────────────────────────────────

/**
 * Sends the text to the server and returns its answer as is.
 * On a 401 it asks for a new token and retries once.
 *
 * @returns {Promise<{findings, terms, summary, dropped, truncated, model, cached, quota}>}
 */
export async function analyzeRemote(
  { text, url = null, actionType = 'manual', button = null, uiLang = 'it', jurisdiction = 'IT', signal } = {},
  { storage = chrome.storage.local, fetchImpl = fetch, base = API_BASE } = {}
) {
  const opts = { storage, fetchImpl, base };
  const payload = {
    text,
    url: url || undefined,
    action: ACTION_MAP[actionType] || 'other',
    button: button ? String(button).slice(0, 120) : undefined,
    uiLang: ['it', 'en', 'es', 'de', 'fr', 'nl'].includes(uiLang) ? uiLang : 'it',
    userCountry: COUNTRY_MAP[jurisdiction] || 'IT',
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await token(opts);
    const res = await call(fetchImpl, `${base}/v1/analyze`, payload, { bearer, signal });
    const body = await readJson(res);
    // A 200 with an unreadable body is a failure, not an empty verdict: read as
    // "no findings" it would become "all fine", and be cached as such.
    if (res.ok && Array.isArray(body?.findings)) return body;
    if (res.ok) throw new ServerError('upstream', { status: res.status, detail: 'unreadable answer' });
    if (res.status === 401 && attempt === 0) {
      await writeAuth(storage, { token: null });
      continue;
    }
    throw errorFrom(res, body);
  }
  throw new ServerError('auth', { status: 401 });
}

// ── plan ────────────────────────────────────────────────────────────────────

/** A call with the token, retried once after a 401. */
async function authed(path, payload, { storage = chrome.storage.local, fetchImpl = fetch, base = API_BASE, method = 'POST' } = {}) {
  const opts = { storage, fetchImpl, base };
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await token(opts);
    const res = await call(fetchImpl, `${base}${path}`, payload, { bearer, method, signal: AbortSignal.timeout(10000) });
    const body = await readJson(res);
    if (res.ok) return body;
    if (res.status === 401 && attempt === 0) { await writeAuth(storage, { token: null }); continue; }
    throw errorFrom(res, body);
  }
  throw new ServerError('auth', { status: 401 });
}

/** `{ plan: 'free'|'pro'|'max'|'team', active, status, periodEnd, cancelAt, activations, quota }` */
export const getLicense = (o) => authed('/v1/license', undefined, { ...o, method: 'GET' });
/** `{ claim, url }`: the purchase page, linked to this installation. */
/** `lang` picks the pricing page's language on the website. */
export const startCheckout = (plan, o, lang) => authed('/v1/pro/checkout', { plan, ...(lang ? { lang } : {}) }, o);
export const activateLicense = (key, o) => authed('/v1/license/activate', { key: String(key || '').trim() }, o);
export const deactivateLicense = (o) => authed('/v1/license/deactivate', {}, o);
/** "Wrong warning?": only the category, to improve the analysis. */
export const sendFeedback = (category, model, o) => authed('/v1/feedback', { category: String(category || '').slice(0, 40), model: model ? String(model).slice(0, 60) : undefined }, o);

async function call(fetchImpl, url, payload, { bearer = null, signal, method = 'POST' } = {}) {
  const headers = method === 'GET' ? {} : { 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  try {
    return await fetchImpl(url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(payload), signal });
  } catch (err) {
    if (signal?.aborted || err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ServerError('timeout', { detail: String(err?.message || err) });
    }
    throw new ServerError('network', { detail: String(err?.message || err) });
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorFrom(res, body) {
  const code = body?.error || (res.status >= 500 ? 'upstream' : 'input');
  const retry = Number(res.headers?.get?.('retry-after'));
  return new ServerError(code, {
    status: res.status,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
    detail: body?.message || '',
  });
}

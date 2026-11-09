/**
 * Il client del server di AnteFirma.
 *
 * Gira **solo nel service worker**: lì valgono i permessi dell'estensione, e la
 * pagina non vede né il token né le risposte. Il server custodisce la chiave
 * del modello; l'estensione ha soltanto un token che identifica l'installazione
 * — non la persona — e scade dopo 90 giorni.
 *
 * Tutto ciò che arriva dal server è testo scritto da un modello che ha letto
 * una pagina altrui: va mostrato come testo, mai come HTML.
 */

import { API_BASE } from './config.js';

const AUTH_KEY = 'antefirmaAuth';

/** Le azioni che il server conosce, dai tipi di azione dell'estensione. */
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

/** Paese da mandare al server a partire dalla giurisdizione delle impostazioni. */
const COUNTRY_MAP = { IT: 'IT', ES: 'ES', UK: 'GB', US: 'US' };

/**
 * Un errore del server con il codice che decide che cosa fare.
 * `message` è per l'utente (testo dell'estensione, mai quello del server).
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
  quota: 'Hai usato tutte le analisi di oggi. Domani il conteggio riparte.',
  timeout: 'L’analisi ha impiegato troppo tempo.',
  network: 'Il server di AnteFirma non è raggiungibile. Controlla la connessione.',
  busy: 'Il servizio è molto richiesto in questo momento. Riprova fra poco.',
  capacity: 'Il servizio ha raggiunto il limite di oggi. Riprova domani.',
  disabled: 'Il servizio è sospeso per manutenzione.',
  revoked: 'Questa installazione è stata disattivata. Reinstalla l’estensione o scrivici.',
  origin: 'Il server non riconosce questa versione dell’estensione.',
  size: 'La pagina è troppo lunga per essere analizzata.',
  upstream: 'L’analisi non è riuscita. Riprova fra poco.',
};

function messageFor(code) {
  return MESSAGES[code] || 'L’analisi non è riuscita.';
}

// ── token dell'installazione ────────────────────────────────────────────────

async function readAuth(storage) {
  const got = await storage.get(AUTH_KEY);
  return got?.[AUTH_KEY] || {};
}

async function writeAuth(storage, patch) {
  const current = await readAuth(storage);
  await storage.set({ [AUTH_KEY]: { ...current, ...patch } });
}

/** L'id casuale dell'installazione: generato una volta, conservato in locale. */
export async function installId({ storage = chrome.storage.local } = {}) {
  const auth = await readAuth(storage);
  if (auth.installId) return auth.installId;
  const id = crypto.randomUUID();
  await writeAuth(storage, { installId: id });
  return id;
}

/** Chiede un token nuovo al server con lo stesso id di installazione. */
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

// ── analisi ─────────────────────────────────────────────────────────────────

/**
 * Manda il testo al server e restituisce la sua risposta così com'è.
 * A un 401 chiede un token nuovo e riprova una volta sola.
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
    uiLang: ['it', 'en', 'es'].includes(uiLang) ? uiLang : 'it',
    userCountry: COUNTRY_MAP[jurisdiction] || 'IT',
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await token(opts);
    const res = await call(fetchImpl, `${base}/v1/analyze`, payload, { bearer, signal });
    const body = await readJson(res);
    if (res.ok) return body;
    if (res.status === 401 && attempt === 0) {
      await writeAuth(storage, { token: null });
      continue;
    }
    throw errorFrom(res, body);
  }
  throw new ServerError('auth', { status: 401 });
}

async function call(fetchImpl, url, payload, { bearer = null, signal } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  try {
    return await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(payload), signal });
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

/**
 * Prova di cosa hai accettato.
 *
 * Al momento in cui l'utente prosegue, si fissa un'impronta del testo esatto
 * che stava accettando: hash SHA-256, data, estratto, e i numeri del verdetto.
 *
 * Serve a due cose molto concrete:
 *  - sei mesi dopo, quando il fornitore sostiene che avevi accettato altro,
 *    tu hai lo snapshot di quel giorno;
 *  - quando le condizioni cambiano, il confronto non dice "i termini sono
 *    cambiati" — informazione inutile — ma "il tuo impegno è passato da
 *    239,88 € a 479,76 €".
 */

import { normalize, formatMoney } from './text.js';
import { t, locale } from '../i18n/index.js';

const MAX_STORED_CHARS = 200_000;

/**
 * Sotto questa soglia non c'è niente da attestare. Il caso che conta non è il
 * testo corto ma il testo *assente*: lo SHA-256 della stringa vuota coincide
 * con sé stesso, quindi la verifica rispondeva «✓ il testo conservato
 * corrisponde all'impronta» su una prova che non conteneva nulla.
 */
const MIN_PROOF_CHARS = 40;

/** SHA-256 in esadecimale. Disponibile sia nel service worker sia in Node. */
export async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Costruisce lo snapshot da conservare.
 *
 * @param {object} p
 * @param {string} p.text     Testo accettato.
 * @param {object} p.verdict  Verdetto calcolato su quel testo.
 * @param {number} [p.now]
 */
export async function createSnapshot({ text = '', verdict = {}, now = Date.now() } = {}) {
  const clean = normalize(text);
  const hash = await sha256(clean);

  return {
    hash,
    at: new Date(now).toISOString(),
    /** Senza testo l'impronta non attesta niente: chi la usa deve saperlo. */
    empty: clean.length < MIN_PROOF_CHARS,
    chars: clean.length,
    truncated: clean.length > MAX_STORED_CHARS,
    excerpt: clean.slice(0, 600),
    /** Il testo integrale resta in locale: è la prova vera e propria. */
    text: clean.slice(0, MAX_STORED_CHARS),
    url: verdict.url || null,
    termsUrl: verdict.termsUrl || null,
    /** Fotografia dei numeri, per il confronto futuro. */
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
  return null; // il canone unitario sta in ctx.pricing, non nelle righe aggregate
}

/**
 * Confronta lo snapshot conservato con una nuova analisi delle stesse condizioni.
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

  // Un cambio è "major" quando tocca il portafoglio o aggiunge una categoria
  // che pesa: è il caso in cui vale la pena disturbare l'utente.
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
  if (!changed) return t('Le condizioni sono identiche a quelle che avevi accettato.');

  const bits = [];
  if (costDelta && oldCost != null && newCost != null) {
    const vars = { a: formatMoney(oldCost, currency), b: formatMoney(newCost, currency), d: (costDelta > 0 ? '+' : '') + formatMoney(costDelta, currency) };
    bits.push(costDelta > 0
      ? t('Il tuo impegno potenziale è salito da {a} a {b} ({d}).', vars)
      : t('Il tuo impegno potenziale è sceso da {a} a {b} ({d}).', vars));
  }
  if (added.length) bits.push(t('Condizioni nuove: {n}.', { n: added.length }));
  if (removed.length) bits.push(t('Condizioni rimosse: {n}.', { n: removed.length }));
  if (!bits.length && hashChanged) bits.push(t('Il testo è cambiato, ma le condizioni rilevanti sembrano equivalenti.'));
  return bits.join(' ');
}

/**
 * Riga di attestazione leggibile, da allegare a un reclamo.
 * Non ha valore di certificazione: è una dichiarazione di ciò che il tuo
 * browser ha letto in quel momento, con l'impronta che lo rende verificabile.
 */
export function attestation(snapshot, { host } = {}) {
  const d = new Date(snapshot.at);
  return [
    t('ATTESTAZIONE DI CONTENUTO (generata localmente da AnteFirma)'),
    '',
    `${t('Fonte:')} ${snapshot.url || host || '—'}`,
    `${t('Data e ora:')} ${d.toLocaleString(locale())} (${snapshot.at})`,
    `${t('Lunghezza testo:')} ${t('{n} caratteri', { n: snapshot.chars })}`,
    `${t('Impronta SHA-256:')} ${snapshot.hash}`,
    '',
    t('Il testo integrale corrispondente a questa impronta è conservato in locale e può essere esportato per il confronto. Ricalcolando lo SHA-256 del testo esportato si ottiene l’impronta qui sopra.'),
    '',
    t('Questa attestazione non è una certificazione con valore legale autonomo: documenta ciò che il browser ha ricevuto nel momento indicato.'),
  ].join('\n');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Registro degli impegni: il pezzo che trasforma un avviso di dieci secondi in
 * qualcosa che ti serve ancora fra ventiquattro mesi.
 *
 * Tutti i concorrenti ti aiutano a *non entrare*. Nessuno ti aiuta a *uscire*.
 * Qui l'impegno accettato diventa una scadenza con dei promemoria e, quando
 * arriva il momento, una lettera già scritta.
 *
 * Logica pura: nessuna API di Chrome, così è verificabile in Node.
 */

import { formatMoney, PERIOD_MONTHS } from './text.js';
import { t, tn, locale } from '../i18n/index.js';

export const COMMITMENT_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  IGNORED: 'ignored',
};

const DAY = 86_400_000;

/** Quanti giorni prima della scadenza farsi vivi. */
export const REMINDER_OFFSETS_DAYS = [30, 7, 1];

/**
 * Costruisce un impegno a partire dal verdetto, nel momento in cui l'utente
 * decide di procedere.
 */
export function buildCommitment({ verdict = {}, snapshot = null, decision = 'proceed', now = Date.now(), id = null } = {}) {
  const cost = verdict.cost || {};
  const start = new Date(now);

  const horizonMonths = cost.horizonMonths ?? null;
  const noticeMonths = cost.notice?.months ?? null;

  const renewalAt = horizonMonths ? addMonths(start, horizonMonths) : null;
  const deadlineAt = renewalAt && noticeMonths ? addMonths(renewalAt, -noticeMonths) : renewalAt;

  const recurring = (cost.lines || []).find((l) => l.kind === 'recurring') || null;

  return {
    id: id || makeId(now),
    createdAt: start.toISOString(),
    status: COMMITMENT_STATUS.ACTIVE,
    decision,

    host: verdict.host || null,
    url: verdict.url || null,
    title: verdict.title || null,
    provider: providerName(verdict),
    actionType: verdict.actionType || null,
    termsUrl: verdict.termsUrl || snapshot?.termsUrl || null,

    headline: verdict.headline || null,
    score: verdict.score ?? null,
    level: verdict.level?.id ?? null,
    categories: (verdict.findings || []).map((f) => f.category),

    currency: cost.currency || 'EUR',
    // Il prezzo unitario e la sua periodicità: senza, il confronto futuro
    // partirebbe da un contesto diverso e mentirebbe sui numeri.
    pricing: verdict.pricing
      ? { amount: verdict.pricing.amount ?? null, currency: verdict.pricing.currency || 'EUR', period: verdict.pricing.period || null, recurring: Boolean(verdict.pricing.recurring) }
      : null,
    worstCase: cost.worstCase ?? null,
    recurringTotal: recurring?.amount ?? null,
    horizonMonths,
    noticeMonths,
    autoRenewal: Boolean(cost.hasAutoRenewal),
    penalty: cost.penalty?.amount ?? null,

    renewalAt: renewalAt ? renewalAt.toISOString() : null,
    deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,

    snapshot: snapshot
      ? { hash: snapshot.hash, at: snapshot.at, chars: snapshot.chars, excerpt: snapshot.excerpt }
      : null,
    lastCheck: null,
    changes: [],
    reminders: [],
    notes: null,
  };
}

/**
 * Chi incassa per conto d'altri: il nome del dominio è quello del servizio di
 * pagamento, non di chi vende. Lì il venditore si cerca nel titolo della pagina.
 */
const PAYMENT_HOSTS = /(^|\.)(paddle\.com|stripe\.com|paypal\.com|lemonsqueezy\.com|chargebee\.com|recurly\.com|fastspring\.com|gumroad\.com|2checkout\.com|checkout\.com|adyen\.com|mollie\.com|klarna\.com|satispay\.com|nexi\.it|sumup\.com|shopify\.com)$/i;
const CHECKOUT_WORDS = /\b(checkout|check-out|pagamento|pago|payment|pay|paga|secure|sicuro|seguro|cassa|ordine|order|pedido|paddle|stripe|paypal|lemon ?squeezy|chargebee|recurly|fastspring|gumroad|klarna|sandbox)\b/gi;
export const isPaymentHost = (host = '') => PAYMENT_HOSTS.test(String(host).replace(/^www\./, ''));

/** Il venditore dal titolo di una pagina di pagamento («Checkout – Acme Pro» → «Acme Pro»); null se non c'è. */
export function merchantFromTitle(title = '') {
  const parts = String(title).split(/\s+[-–—|·:]\s+|\s*\|\s*/).map((p) => p.replace(CHECKOUT_WORDS, '').replace(/\s{2,}/g, ' ').trim())
    .filter((p) => p.length >= 2 && /\p{L}/u.test(p));
  return parts[0] ? parts[0].slice(0, 60) : null;
}

/** Nome leggibile del fornitore, ricavato da titolo o dominio. */
export function providerName(verdict = {}) {
  const host = (verdict.host || '').replace(/^www\./, '');
  // Senza sito né titolo il nome resta vuoto: lettera e pannello mettono il segnaposto nella loro lingua.
  if (!host) return verdict.title || null;
  // Una pagina di Paddle, Stripe…: il nome giusto è nel titolo; altrimenti vuoto, e si rinomina dal pannello.
  if (isPaymentHost(host)) return (verdict.merchant && merchantFromTitle(verdict.merchant)) || merchantFromTitle(verdict.title || '');
  const base = host.split('.')[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : host;
}

/**
 * Il piano dei promemoria: **dati, non allarmi**.
 *
 * La versione precedente programmava tre `chrome.alarms` a 690, 713 e 719
 * giorni di distanza. Un allarme così lontano è una scommessa: non sopravvive
 * in modo garantito a un aggiornamento dell'estensione, e se scatta a browser
 * chiuso è semplicemente perso — silenzio, nel momento in cui l'avviso serviva.
 *
 * Ora il piano è una lista salvata insieme all'impegno, e una passata
 * quotidiana decide cosa è dovuto. Se un giorno salta, il giorno dopo recupera.
 */
export function planReminders(commitment, now = Date.now()) {
  if (!commitment?.deadlineAt) return [];
  const deadline = new Date(commitment.deadlineAt).getTime();

  const out = REMINDER_OFFSETS_DAYS.map((days) => {
    const at = deadline - days * DAY;
    return {
      days,
      at: new Date(at).toISOString(),
      // Un promemoria la cui data è già passata nasce consumato: se registri
      // l'impegno a dieci giorni dalla scadenza, l'avviso "mancano 30 giorni"
      // non deve partire — sarebbe falso e distruggerebbe la fiducia
      // nell'unica cosa che qui deve essere esatta, cioè la data.
      fired: at <= now,
    };
  });

  // In compenso, chi scopre l'estensione a ridosso della scadenza va avvisato
  // subito, con il numero di giorni reale.
  const firstReminderAt = deadline - Math.max(...REMINDER_OFFSETS_DAYS) * DAY;
  if (firstReminderAt <= now && deadline > now) {
    out.push({
      days: Math.max(1, Math.round((deadline - now) / DAY)),
      at: new Date(now).toISOString(),
      fired: false,
      kind: 'urgent',
    });
  }

  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * Quale promemoria è dovuto adesso.
 *
 * Ne restituisce **uno solo**, il più urgente fra quelli scaduti e non ancora
 * inviati: dopo una pausa lunga del browser sarebbero dovuti tutti e tre, e
 * tre notifiche di fila sullo stesso contratto sono un modo sicuro per farsi
 * disattivare.
 */
export function dueReminder(commitment, now = Date.now()) {
  if (!commitment?.reminders?.length) return null;
  if (commitment.status !== COMMITMENT_STATUS.ACTIVE) return null;
  if (new Date(commitment.deadlineAt || 0).getTime() < now) return null;

  const due = commitment.reminders
    .filter((r) => !r.fired && new Date(r.at).getTime() <= now)
    .sort((a, b) => a.days - b.days);

  return due[0] || null;
}

/**
 * La finestra di disdetta si è chiusa mentre nessuno guardava.
 * È sgradevole da leggere, ma il silenzio è peggio: senza questo avviso
 * l'utente scopre il rinnovo dall'estratto conto.
 */
export function missedWindow(commitment, now = Date.now()) {
  if (!commitment?.deadlineAt) return false;
  if (commitment.status !== COMMITMENT_STATUS.ACTIVE) return false;
  if (commitment.missedNotified) return false;
  return new Date(commitment.deadlineAt).getTime() < now;
}

/** Stato calcolato, per la UI. */
export function commitmentState(commitment, now = Date.now()) {
  if (!commitment) return { label: '—', urgency: 'none', daysLeft: null };
  if (commitment.status === COMMITMENT_STATUS.CANCELLED) {
    return { label: t('Disdetto'), urgency: 'done', daysLeft: null };
  }
  if (commitment.status === COMMITMENT_STATUS.IGNORED) {
    return { label: t('Ignorato'), urgency: 'none', daysLeft: null };
  }
  if (!commitment.deadlineAt) {
    return { label: t('Nessuna scadenza rilevata'), urgency: 'none', daysLeft: null };
  }

  const daysLeft = Math.ceil((new Date(commitment.deadlineAt).getTime() - now) / DAY);
  if (daysLeft < 0) {
    const renewalPassed = commitment.renewalAt && new Date(commitment.renewalAt).getTime() < now;
    return {
      label: renewalPassed ? t('Rinnovato: la finestra di disdetta è passata') : t('Finestra di disdetta scaduta'),
      urgency: 'passed',
      daysLeft,
    };
  }
  if (daysLeft <= 7) return { label: tn(daysLeft, 'Disdici entro {n} giorno', 'Disdici entro {n} giorni'), urgency: 'critical', daysLeft };
  if (daysLeft <= 30) return { label: tn(daysLeft, 'Disdici entro {n} giorno', 'Disdici entro {n} giorni'), urgency: 'soon', daysLeft };
  return { label: t('Disdetta entro il {d}', { d: formatDate(new Date(commitment.deadlineAt)) }), urgency: 'later', daysLeft };
}

/**
 * Quanto ti costa non fare niente: è il numero che rende concreta la scadenza.
 */
export function costOfDoingNothing(commitment) {
  if (!commitment?.autoRenewal) return null;
  const amount = commitment.recurringTotal ?? commitment.worstCase ?? null;
  if (amount == null) return null;
  return {
    amount,
    currency: commitment.currency || 'EUR',
    label: t('Se non disdici, parte un nuovo periodo da {x}.', { x: formatMoney(amount, commitment.currency || 'EUR') }),
  };
}

/** Riepilogo dell'esposizione complessiva, per l'intestazione del pannello. */
export function portfolioSummary(commitments = [], now = Date.now()) {
  const active = commitments.filter((c) => c.status === COMMITMENT_STATUS.ACTIVE);
  const byCurrency = new Map();
  for (const c of active) {
    if (c.worstCase == null) continue;
    const cur = c.currency || 'EUR';
    byCurrency.set(cur, round2((byCurrency.get(cur) || 0) + c.worstCase));
  }
  const upcoming = active
    .map((c) => ({ c, state: commitmentState(c, now) }))
    .filter((x) => x.state.daysLeft != null && x.state.daysLeft >= 0)
    .sort((a, b) => a.state.daysLeft - b.state.daysLeft);

  return {
    count: active.length,
    totals: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
    next: upcoming[0] || null,
    urgent: upcoming.filter((x) => x.state.daysLeft <= 30).length,
  };
}

/** Deriva il canone unitario, se ricostruibile. */
export function unitPrice(commitment) {
  if (commitment.recurringTotal == null || !commitment.horizonMonths) return null;
  const period = commitment.period || 'month';
  const months = PERIOD_MONTHS[period] || 1;
  const cycles = Math.max(1, Math.round(commitment.horizonMonths / months));
  return round2(commitment.recurringTotal / cycles);
}

// ── helper ──────────────────────────────────────────────────────────────────


export function formatDate(d, loc = locale()) {
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const whole = Math.trunc(months);
  const frac = months - whole;
  d.setMonth(d.getMonth() + whole);
  if (frac) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function makeId(now) {
  return `${now.toString(36)}-${Math.floor(Math.random() * 1e8).toString(36)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

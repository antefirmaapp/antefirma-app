/**
 * Service worker: il cervello dell'estensione.
 *
 * Il content script osserva e blocca; qui si decide. Tenere l'analisi fuori
 * dalla pagina significa che nessuno script del sito può leggerla, alterarla o
 * intercettare la chiave API.
 *
 * Da qui passano anche le tre cose che vivono più a lungo di una pagina:
 * il registro degli impegni, i promemoria delle scadenze e il controllo
 * periodico delle condizioni già accettate.
 */

import { analyze } from '../core/analyzer.js';
import { shouldBlock } from '../core/scoring.js';
import { ACTION_TYPES } from '../core/constants.js';
import { isAllowed } from '../core/sender.js';
import { htmlToText, hashText, normalize, formatMoney } from '../core/text.js';
import { createSnapshot, compareSnapshot, sha256, attestation } from '../core/proof.js';
import { buildCommitment, planReminders, dueReminder, missedWindow, commitmentState, COMMITMENT_STATUS } from '../core/commitments.js';
import { buildIcs } from '../core/ics.js';
import { buildLetter, suggestKind } from '../core/letter.js';
import { localModelStatus } from '../core/local-llm.js';
import {
  getSettings, setSettings, isAllowlisted,
  getCached, setCached, clearCache,
  pushHistory, getHistory, updateHistoryEntry, clearHistory,
  getCommitments, getCommitment, saveCommitment, updateCommitment, deleteCommitment,
  setSnapshotText, getSnapshotText,
} from '../core/storage.js';

const MAX_TERMS_BYTES = 1_500_000;

/**
 * Tempo massimo di un'analisi, e del solo scaricamento dei termini.
 *
 * Il click è sospeso e la pagina è coperta dall'avviso: se l'API del modello
 * non risponde, l'utente resta davanti a una clessidra senza fine, con due
 * sole uscite — tornare indietro o procedere alla cieca. `analyze()` accettava
 * già un AbortSignal e lo propagava fino a fetch, ma in tutto il progetto non
 * ne veniva creato nessuno: era sempre undefined.
 *
 * Allo scadere non si annulla l'analisi: si degrada al verdetto delle sole
 * regole locali, che a quel punto è già calcolato, e lo si dichiara.
 */
const ANALYSIS_BUDGET_MS = 12_000;
const TERMS_FETCH_BUDGET_MS = 6_000;
const WATCH_ALARM = 'vincolo-controllo-condizioni';
/**
 * Un solo allarme ricorrente al posto di tre allarmi per impegno programmati a
 * due anni di distanza. Scatta due volte al giorno: se una passata salta —
 * browser chiuso, aggiornamento, sospensione — la successiva recupera.
 */
const SWEEP_ALARM = 'vincolo-passata-quotidiana';

// ── ciclo di vita ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await getSettings();
  setupContextMenus();
  await scheduleAlarms();
  await sweep();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
});

chrome.runtime.onStartup?.addListener(async () => {
  setupContextMenus();
  await scheduleAlarms();
  await sweep();
});

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'cf-analyze-selection',
      title: 'Analizza il testo selezionato con Vincolo',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-page',
      title: 'Analizza questa pagina (contratto, termini, checkout)',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-link',
      title: 'Analizza il documento collegato',
      contexts: ['link'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch { /* il pannello può essere già aperto */ }

  const payload =
    info.menuItemId === 'cf-analyze-selection'
      ? { kind: 'selection', text: info.selectionText || '', url: tab.url, title: tab.title }
      : info.menuItemId === 'cf-analyze-link'
        ? { kind: 'url', url: info.linkUrl }
        : { kind: 'page', tabId: tab.id, url: tab.url, title: tab.title };

  await chrome.storage.session.set({ pendingPanelRequest: { ...payload, at: Date.now() } });
  chrome.runtime.sendMessage({ type: 'PANEL_REQUEST', payload }).catch(() => {});
});

/** Il sottoinsieme di impostazioni che serve davvero a un content script. */
async function contentSettings() {
  const s = await getSettings();
  return {
    enabled: s.enabled,
    allowlist: s.allowlist || [],
    blockFrom: s.blockFrom,
    speculative: s.speculative,
  };
}

/**
 * Aggiunge un dominio alla allowlist. Un messaggio dedicato invece di un
 * `SET_SETTINGS` generico: il content script deve poter fare questa cosa sola.
 */
async function allowlistAdd(host) {
  const clean = String(host || '').trim().toLowerCase().replace(/^www\./, '');
  if (!clean || !/^[a-z0-9.-]+$/.test(clean)) throw new Error('Dominio non valido.');
  const s = await getSettings();
  const allowlist = [...new Set([...(s.allowlist || []), clean])];
  await setSettings({ allowlist });
  return { allowlist };
}

// ── router dei messaggi ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => {
      console.error('[Vincolo]', msg?.type, err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true;
});

async function handle(msg, sender) {
  /**
   * `GET_SETTINGS` restituiva l'oggetto **integrale** — chiave API, nome,
   * indirizzo, email — e il detector lo chiedeva a ogni caricamento di ogni
   * frame. Bastavano `enabled` e `allowlist`. Oltre a essere una violazione
   * della regola di minimizzazione del Chrome Web Store, contraddiceva la
   * frase che il prodotto scrive di sé: «nessuno script del sito può leggerla».
   *
   * `SET_SETTINGS` accettava per giunta un patch arbitrario: un content script
   * compromesso poteva sovrascrivere la chiave o spegnere il firewall.
   */
  if (!isAllowed(msg?.type, sender, chrome.runtime.id, chrome.runtime.getURL(''))) {
    throw new Error('Messaggio non consentito da una pagina web.');
  }

  switch (msg?.type) {
    case 'GET_CONTENT_SETTINGS':
      return contentSettings();
    case 'ALLOWLIST_ADD':
      return allowlistAdd(msg.payload?.host);
    case 'PREFETCH_ACTION':
      return prefetchAction(msg.payload, sender);
    case 'ANALYZE_ACTION':
      return analyzeAction(msg.payload, sender);
    case 'ANALYZE_TEXT':
      return analyzeText(msg.payload);
    case 'FETCH_DOCUMENT':
      return fetchDocument(msg.payload?.url);
    case 'GET_SETTINGS':
      return getSettings();
    case 'SET_SETTINGS':
      return setSettings(msg.payload || {});
    case 'GET_HISTORY':
      return getHistory();
    case 'RECORD_DECISION':
      return recordDecision(msg.payload);
    case 'CLEAR_HISTORY':
      return clearHistory();
    case 'CLEAR_CACHE':
      return clearCache();
    case 'TEST_API_KEY':
      return testApiKey(msg.payload);
    case 'LOCAL_MODEL_STATUS':
      return localModelStatus();

    // ── kit di uscita ──────────────────────────────────────────────────────
    case 'GET_COMMITMENTS':
      return getCommitments();
    case 'SAVE_COMMITMENT_FROM_VERDICT':
      return commitmentFromVerdict(msg.payload);
    case 'UPDATE_COMMITMENT':
      return updateAndReschedule(msg.payload?.id, msg.payload?.patch || {});
    case 'DELETE_COMMITMENT':
      return removeCommitment(msg.payload?.id);
    case 'BUILD_LETTER':
      return letterFor(msg.payload);
    case 'BUILD_ICS':
      return icsFor(msg.payload?.id);
    case 'GET_PROOF':
      return proofFor(msg.payload?.id);
    case 'CHECK_CHANGES':
      return checkChanges(msg.payload?.id, { trigger: 'manual' });

    case 'GET_PENDING_PANEL_REQUEST': {
      const { pendingPanelRequest } = await chrome.storage.session.get('pendingPanelRequest');
      if (pendingPanelRequest) await chrome.storage.session.remove('pendingPanelRequest');
      return pendingPanelRequest || null;
    }
    default:
      throw new Error(`Messaggio non riconosciuto: ${msg?.type}`);
  }
}

// ── analisi speculativa ─────────────────────────────────────────────────────

/**
 * Gira *prima* del click, quando il pulsante entra nel campo visivo o l'utente
 * ci passa sopra. Usa solo ciò che non costa nulla — regole locali e modello
 * on-device — e scalda la stessa cache che userà il click. Non tocca lo
 * storico, non aggiorna il badge, non deve lasciare tracce.
 */
async function prefetchAction(payload = {}, sender) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.speculative) return { skipped: true };

  const ctx = payload.ctx || {};
  ctx.url = ctx.url || sender?.tab?.url || sender?.url;
  if (isAllowlisted(ctx.url, settings)) return { skipped: true };

  const text = normalize(payload.text || '');
  if (text.length < 200) return { skipped: true };

  const key = cacheKey(text, payload.actionType, settings);
  if (await getCached(key, settings.cacheTtlHours)) return { cached: true };

  const verdict = await analyze({
    text,
    ctx,
    actionType: payload.actionType || ACTION_TYPES.ACCEPT_TERMS,
    settings,
    mode: 'speculative',
  });
  await setCached(key, verdict);

  return { prepared: true, level: verdict.level.id, partial: verdict.engine.partial };
}

// ── analisi di un'azione intercettata ───────────────────────────────────────

async function analyzeAction(payload = {}, sender) {
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

  const key = cacheKey(text, payload.actionType, settings);
  const remoteConfigured = settings.useLLM && settings.provider !== 'none' && Boolean((settings.apiKey || '').trim());

  let verdict = payload.refine ? null : await getCached(key, settings.cacheTtlHours);
  let cached = Boolean(verdict);

  if (!verdict) {
    verdict = await analyze({
      text,
      ctx,
      actionType: payload.actionType || ACTION_TYPES.ACCEPT_TERMS,
      settings,
      mode: 'full',
      signal: AbortSignal.timeout(ANALYSIS_BUDGET_MS),
    });
    if (!verdict.engine.llmError) await setCached(key, verdict);
  }

  /**
   * Il verdetto veniva dalla pre-analisi e c'è ancora un gradino da salire:
   * lo si mostra subito e si dice all'interfaccia che può chiedere il
   * raffinamento. Meglio un avviso istantaneo e poi più preciso, che tre
   * secondi di clessidra.
   */
  const refinable = cached && verdict.engine?.partial && remoteConfigured;

  verdict = { ...verdict, cached, termsSource };
  const blocking = shouldBlock(verdict.level.id, settings.blockFrom);

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

  // Il verdetto integrale resta a disposizione per il momento della decisione:
  // se l'utente prosegue, è da qui che nasce l'impegno registrato.
  await chrome.storage.session.set({ [`verdict:${id}`]: { verdict, text } });

  await updateBadge(sender?.tab?.id, verdict.level);

  return { skip: false, blocking, refinable, verdict: { ...verdict, historyId: id } };
}

/** Analisi lanciata dal side panel (incolla, PDF, pagina, URL). */
async function analyzeText(payload = {}) {
  const settings = await getSettings();
  const text = normalize(payload.text || '');
  if (text.length < 40) throw new Error('Testo troppo breve per un’analisi sensata.');

  const ctx = {
    url: payload.url || null,
    title: payload.title || null,
    pricing: payload.pricing || {},
    terms: { textInPage: true },
    ...(payload.ctx || {}),
  };

  const actionType = payload.actionType || ACTION_TYPES.MANUAL;
  const key = cacheKey(text, actionType, settings);

  if (!payload.force) {
    const cached = await getCached(key, settings.cacheTtlHours);
    if (cached && !cached.engine?.partial) return { ...cached, cached: true };
  }

  const verdict = await analyze({
    text, ctx, actionType, settings, mode: 'full',
    signal: AbortSignal.timeout(ANALYSIS_BUDGET_MS),
  });
  if (!verdict.engine.llmError) await setCached(key, verdict);

  // Anche le analisi manuali possono diventare impegni da sorvegliare.
  const id = `manual-${Date.now().toString(36)}`;
  await chrome.storage.session.set({ [`verdict:${id}`]: { verdict, text } });
  return { ...verdict, historyId: id };
}

// ── decisione e registro degli impegni ──────────────────────────────────────

/**
 * `via` non cambia la decisione, ne registra la provenienza: «Continua
 * comunque» (blocked), sotto soglia (auto), sito escluso (allowlist). Serve a
 * uno storico veritiero — prima ogni intercettazione non bloccante restava
 * con `decision: null` — e sarà la base per misurare i falsi positivi.
 */
async function recordDecision({ id, decision, via = null } = {}) {
  await updateHistoryEntry(id, { decision, via, decidedAt: new Date().toISOString() });
  if (decision !== 'proceed') return { recorded: true, commitment: null };

  const settings = await getSettings();
  if (!settings.trackCommitments) return { recorded: true, commitment: null };

  const stored = (await chrome.storage.session.get(`verdict:${id}`))[`verdict:${id}`];
  if (!stored) return { recorded: true, commitment: null };

  const commitment = await commitmentFromVerdict({ verdict: stored.verdict, text: stored.text, decision });
  return { recorded: true, commitment };
}

/**
 * Crea l'impegno: snapshot del testo accettato, scadenze calcolate, promemoria
 * programmati. È il momento in cui un avviso si trasforma in qualcosa che
 * l'utente ritroverà fra due anni.
 */
async function commitmentFromVerdict({ historyId = null, verdict = null, text = '', decision = 'proceed' } = {}) {
  /**
   * Il testo dev'essere quello effettivamente analizzato. Il pannello passava
   * sempre il contenuto della textarea di «Incolla testo»: per un'analisi da
   * PDF, da pagina corrente o da URL quella textarea è vuota, e ne nasceva uno
   * snapshot di zero caratteri — con l'hash della stringa vuota, che la
   * verifica dichiarava valido. Il verdetto integrale è già in sessione
   * insieme al suo testo: si legge da lì.
   */
  if (historyId) {
    const stored = (await chrome.storage.session.get(`verdict:${historyId}`))[`verdict:${historyId}`];
    if (stored) {
      verdict = verdict || stored.verdict;
      text = stored.text || text;
    }
  }
  if (!verdict) throw new Error('Verdetto mancante.');

  const snapshot = await createSnapshot({ text, verdict });
  if (snapshot.empty) {
    throw new Error('Testo del contratto non disponibile: senza, la prova non attesterebbe nulla.');
  }
  const commitment = buildCommitment({ verdict, snapshot, decision });

  // Solo gli impegni che hanno una conseguenza nel tempo meritano il registro.
  const worthTracking =
    commitment.deadlineAt || commitment.renewalAt || commitment.worstCase != null || commitment.autoRenewal;
  if (!worthTracking) return null;

  await saveCommitment(commitment);
  await setSnapshotText(commitment.id, snapshot.text);
  return planAndSave(commitment);
}

async function updateAndReschedule(id, patch) {
  const updated = await updateCommitment(id, patch);
  if (!updated) return null;
  // Riattivato dopo una disdetta annullata: il piano va ricalcolato da capo.
  if (updated.status === COMMITMENT_STATUS.ACTIVE && patch.status) return planAndSave(updated);
  return updated;
}

async function removeCommitment(id) {
  return deleteCommitment(id);
}

// ── promemoria ──────────────────────────────────────────────────────────────

/**
 * I promemoria sono un piano salvato insieme all'impegno, non allarmi
 * programmati a due anni di distanza: chi decide cosa è dovuto è la passata
 * quotidiana. È un meccanismo che si auto-ripara — un giorno saltato viene
 * recuperato il giorno dopo — mentre un allarme perso è perso e basta.
 */
async function planAndSave(commitment) {
  const settings = await getSettings();
  if (!settings.reminders) return commitment;
  const reminders = planReminders(commitment);
  return (await updateCommitment(commitment.id, { reminders })) || commitment;
}

async function scheduleAlarms() {
  const settings = await getSettings();
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 1 });
  if (settings.watchChanges) {
    chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 60 * 24 * 7, delayInMinutes: 60 });
  } else {
    chrome.alarms.clear(WATCH_ALARM);
  }
}

/**
 * La passata: guarda tutti gli impegni attivi e decide cosa dire.
 * Un solo promemoria per impegno, il più urgente: dopo una pausa lunga del
 * browser sarebbero dovuti tutti e tre, e tre notifiche di fila sullo stesso
 * contratto sono il modo più rapido per farsi disattivare.
 */
async function sweep(now = Date.now()) {
  const settings = await getSettings();
  if (!settings.reminders) return { fired: 0 };

  const list = await getCommitments();
  let fired = 0;

  for (const c of list) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) continue;

    // La finestra si è chiusa mentre nessuno guardava: dirlo è sgradevole,
    // ma tacere significa farlo scoprire dall'estratto conto.
    if (missedWindow(c, now)) {
      const renewalAmount = c.recurringTotal ?? c.worstCase;
      await notify({
        id: `missed-${c.id}`,
        title: `${c.provider || c.host}: finestra di disdetta chiusa`,
        message: renewalAmount != null
          ? `Il termine per disdire è passato e il contratto si rinnova: ${formatMoney(renewalAmount, c.currency)}. Apri per vedere cosa puoi ancora fare.`
          : 'Il termine per disdire è passato. Apri per vedere cosa puoi ancora fare.',
        commitmentId: c.id,
      });
      await updateCommitment(c.id, { missedNotified: true });
      fired += 1;
      continue;
    }

    const due = dueReminder(c, now);
    if (!due) continue;

    const state = commitmentState(c, now);
    const renewalAmount = c.recurringTotal ?? c.worstCase;
    await notify({
      id: `reminder-${c.id}-${due.days}`,
      title: `Disdetta ${c.provider || c.host}: mancano ${due.days} giorni`,
      message: renewalAmount != null
        ? `Se non disdici entro il termine, parte un nuovo periodo da ${formatMoney(renewalAmount, c.currency)}. ${state.label}.`
        : `${state.label}. Apri per generare la lettera di disdetta.`,
      commitmentId: c.id,
    });

    // Tutti i promemoria più lontani di questo si considerano consumati:
    // avvisare a 30 giorni dopo aver già avvisato a 7 non ha senso.
    const reminders = (c.reminders || []).map((r) => (r.days >= due.days ? { ...r, fired: true } : r));
    await updateCommitment(c.id, { reminders, lastReminder: new Date(now).toISOString() });
    fired += 1;
  }

  return { fired, checked: list.length };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SWEEP_ALARM) return void (await sweep());
  if (alarm.name === WATCH_ALARM) return void (await watchAllCommitments());
});

// ── notifiche ───────────────────────────────────────────────────────────────

async function notify({ id, title, message, commitmentId }) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
      title,
      message,
      priority: 2,
      requireInteraction: true,
      buttons: [{ title: 'Apri il kit di uscita' }],
    });
    await chrome.storage.session.set({ [`notif:${id}`]: commitmentId });
  } catch (err) {
    // Le notifiche possono essere negate dal sistema operativo: è un peccato,
    // non un errore fatale. La scadenza resta nel pannello e nel calendario.
    console.warn('[Vincolo] notifica non mostrata:', err?.message);
  }
}

async function openCommitment(notificationId) {
  const map = await chrome.storage.session.get(`notif:${notificationId}`);
  const commitmentId = map[`notif:${notificationId}`];
  const url = chrome.runtime.getURL(
    `src/sidepanel/sidepanel.html?tab=commitments${commitmentId ? `&id=${commitmentId}` : ''}`
  );
  chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
}

chrome.notifications?.onClicked.addListener(openCommitment);
chrome.notifications?.onButtonClicked.addListener((id) => openCommitment(id));

// ── controllo delle modifiche ───────────────────────────────────────────────

/**
 * Rilegge le condizioni già accettate e confronta.
 * Il messaggio utile non è "i termini sono cambiati" — che non dice niente —
 * ma "il tuo impegno è passato da 239,88 € a 479,76 €".
 */
async function checkChanges(id, { trigger = 'manual' } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error('Impegno non trovato.');

  const source = commitment.termsUrl || commitment.url;
  if (!source) throw new Error('Per questo impegno non è stato registrato un indirizzo da ricontrollare.');

  const settings = await getSettings();

  // ── Cancello 1: la rete. Costo quasi nullo. ──────────────────────────────
  // Se il server risponde 304 il documento è identico e non è stato trasferito
  // nulla: si chiude qui, senza leggere, senza analizzare, senza spendere.
  const doc = await fetchDocument(source, commitment.http || {});
  if (doc.notModified) {
    return recordCheck(id, unchangedDiff('Il documento non è cambiato dall’ultimo controllo.'), commitment);
  }
  if (!doc.text || doc.text.length < 200) {
    throw new Error('Il documento non è più leggibile automaticamente da questo indirizzo.');
  }
  if (doc.http) await updateCommitment(id, { http: doc.http });

  // ── Cancello 2: l'impronta. Costo nullo, tutto in locale. ────────────────
  const clean = normalize(doc.text);
  const newHash = await sha256(clean);
  if (commitment.snapshot?.hash && newHash === commitment.snapshot.hash) {
    return recordCheck(id, unchangedDiff('Le condizioni sono identiche a quelle che avevi accettato.'), commitment);
  }

  // ── Cancello 3: le regole locali. Costo nullo, nessuna rete. ─────────────
  // Un hash diverso non significa che il *tuo impegno* sia cambiato: basta un
  // anno di copyright o un contatore. Quello che conta sono i fatti derivati —
  // costo, durata, preavviso, penale, categorie — e per ricavarli le regole
  // bastano.
  const snapshot = { ...(commitment.snapshot || {}), verdict: snapshotVerdict(commitment) };
  // Stesso contesto economico dell'analisi originale: confrontare un verdetto
  // calcolato con il prezzo contro uno calcolato senza è un falso allarme
  // garantito, e per giunta rassicurante — segnalerebbe un calo inesistente.
  const recheckCtx = {
    url: source,
    title: commitment.title,
    pricing: commitment.pricing || {},
    terms: { textInPage: true },
  };

  const local = await analyze({
    text: clean,
    ctx: recheckCtx,
    actionType: commitment.actionType || ACTION_TYPES.ACCEPT_TERMS,
    settings,
    mode: 'rules',
  });
  let diff = compareSnapshot(snapshot, { text: clean, verdict: local, newHash });

  if (diff.severity !== 'major') {
    return recordCheck(id, { ...diff, escalated: false }, commitment);
  }

  // ── Solo ora, e solo se qualcosa di sostanziale si è mosso. ──────────────
  // Un controllo che parte da solo non può spendere i tuoi crediti né far
  // uscire il contratto dal browser: se è automatico usa al massimo il modello
  // on-device. Il modello remoto entra in gioco quando sei tu a chiedere il
  // controllo — quello è un consenso esplicito — o se hai attivato l'opzione
  // apposita.
  const remoteAllowed = trigger === 'manual' || settings.watchUsesRemote === true;
  const mode = remoteAllowed ? 'full' : 'speculative';
  if (mode !== 'rules') {
    const better = await analyze({
      text: clean,
      ctx: recheckCtx,
      actionType: commitment.actionType || ACTION_TYPES.ACCEPT_TERMS,
      settings,
      mode,
    });
    diff = { ...compareSnapshot(snapshot, { text: clean, verdict: better, newHash }), escalated: true, model: better.engine.model };
  }

  const saved = await recordCheck(id, diff, commitment);

  await notify({
    id: `change-${id}-${Date.now()}`,
    title: `Condizioni cambiate: ${commitment.provider || commitment.host}`,
    message: diff.summary,
    commitmentId: id,
  });

  return saved;
}

function unchangedDiff(summary) {
  return {
    changed: false, hashChanged: false, added: [], removed: [],
    costDelta: null, scoreDelta: null, severity: 'none',
    summary, escalated: false, checkedAt: new Date().toISOString(),
  };
}

async function recordCheck(id, diff, commitment) {
  const changes = [...(commitment.changes || []), diff].slice(-10);
  await updateCommitment(id, { changes, lastCheck: new Date().toISOString() });
  return diff;
}

/** Ricostruisce la fotografia dei numeri conservata nell'impegno. */
function snapshotVerdict(commitment) {
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

async function watchAllCommitments() {
  const settings = await getSettings();
  if (!settings.watchChanges) return;

  const list = await getCommitments();
  for (const c of list) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) continue;
    if (!c.termsUrl && !c.url) continue;
    try {
      await checkChanges(c.id, { trigger: 'scheduled' });
    } catch {
      /* un sito irraggiungibile non deve fermare gli altri */
    }
  }
}

// ── kit di uscita ───────────────────────────────────────────────────────────

async function letterFor({ id, kind } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error('Impegno non trovato.');
  const settings = await getSettings();
  return buildLetter(commitment, settings.identity || {}, kind || suggestKind(commitment));
}

async function icsFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error('Impegno non trovato.');
  const content = buildIcs(commitment);
  if (!content) throw new Error('Questo impegno non ha una scadenza da mettere in calendario.');
  return { content, filename: `scadenza-${(commitment.provider || 'impegno').toLowerCase()}.ics` };
}

async function proofFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error('Impegno non trovato.');
  const text = await getSnapshotText(id);
  const snapshot = commitment.snapshot || {};

  // Verifica dell'integrità: si ricalcola l'impronta sul testo conservato.
  const recomputed = text ? await sha256(text) : null;

  return {
    commitment,
    snapshot,
    text,
    // Uno snapshot senza testo non può essere "valido": l'impronta della
    // stringa vuota coincide con sé stessa e direbbe di sì a vuoto.
    valid: Boolean(recomputed && recomputed === snapshot.hash && !snapshot.empty),
    recomputed,
    attestation: attestation({ ...snapshot, url: commitment.url }, { host: commitment.host }),
    filename: `prova-${(commitment.provider || 'impegno').toLowerCase()}-${(snapshot.at || '').slice(0, 10)}.txt`,
  };
}

// ── recupero documenti ──────────────────────────────────────────────────────

/**
 * @param {string} url
 * @param {{etag?: string, lastModified?: string}} [validators]
 *        Se forniti, la richiesta diventa condizionale: un 304 significa
 *        "identico" senza trasferire un byte. È il controllo più economico che
 *        esista, e riduce anche il carico sul sito che stiamo interrogando.
 */
async function fetchDocument(url, validators = {}, { signal } = {}) {
  if (!url) throw new Error('URL mancante.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Protocollo non supportato.');
  }

  const headers = {};
  if (validators.etag) headers['if-none-match'] = validators.etag;
  if (validators.lastModified) headers['if-modified-since'] = validators.lastModified;

  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', headers, signal });
  if (res.status === 304) {
    return { url, notModified: true, text: '', http: validators };
  }
  if (!res.ok) throw new Error(`Il documento non è raggiungibile (HTTP ${res.status}).`);

  const http = {
    etag: res.headers.get('etag') || null,
    lastModified: res.headers.get('last-modified') || null,
  };

  const type = res.headers.get('content-type') || '';
  if (type.includes('application/pdf')) {
    return { url: res.url, isPdf: true, text: '', note: 'PDF: aprilo nel pannello laterale per l’analisi.' };
  }

  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_TERMS_BYTES ? buf.slice(0, MAX_TERMS_BYTES) : buf;
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  const text = type.includes('text/plain') ? normalize(raw) : htmlToText(raw);

  return { url: res.url, isPdf: false, text, chars: text.length, http, truncated: buf.byteLength > MAX_TERMS_BYTES };
}

// ── varie ───────────────────────────────────────────────────────────────────

async function testApiKey({ provider, apiKey, model } = {}) {
  const settings = { provider, apiKey, model, useLLM: true };
  const { analyzeWithLLM } = await import('../core/llm.js');
  const probe = 'Il servizio si rinnova automaticamente ogni 12 mesi salvo disdetta con 30 giorni di preavviso. Costo 19,99 euro al mese. Penale di recesso anticipato: 49 euro.';
  const out = await analyzeWithLLM({
    text: probe,
    ctx: { url: 'https://example.test', pricing: { amount: 19.99, currency: 'EUR', period: 'month' } },
    ruleFindings: [],
    actionType: ACTION_TYPES.SUBSCRIBE,
    profile: { money: true },
    jurisdiction: 'IT',
    settings,
  });
  return { ok: true, clauses: out.clauses.length, worstCase: out.economics.worstCaseTotal };
}

async function updateBadge(tabId, level) {
  if (!tabId || !chrome.action?.setBadgeText) return;
  const text = { safe: '', review: '!', commitment: '!!', high_risk: '!!!', critical: '⛔' }[level.id] ?? '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: level.color });
  } catch { /* la tab può essere già chiusa */ }
}

function cacheKey(text, actionType, settings) {
  return `${hashText(text)}|${actionType}|${settings.jurisdiction}|${profileKey(settings.profile)}`;
}

function profileKey(profile = {}) {
  return Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(',');
}

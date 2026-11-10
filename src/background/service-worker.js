/**
 * Service worker: the extension's brain.
 *
 * The content script watches and blocks; decisions are made here. Keeping the
 * analysis out of the page means no site script can read it, alter it or
 * intercept the installation token.
 *
 * The three things that live longer than a page also go through here: the
 * commitment register, deadline reminders and the periodic check of terms
 * already accepted.
 */

import { analyze } from '../core/analyzer.js';
import { shouldBlock } from '../core/scoring.js';
import { ACTION_TYPES } from '../core/constants.js';
import { isAllowed } from '../core/sender.js';
import { htmlToText, hashText, normalize, formatMoney } from '../core/text.js';
import { createSnapshot, compareSnapshot, sha256, attestation } from '../core/proof.js';
import { buildCommitment, planReminders, dueReminder, missedWindow, commitmentState, COMMITMENT_STATUS } from '../core/commitments.js';
import { buildIcs } from '../core/ics.js';
import { buildLetter, suggestKind, letterLangFor } from '../core/letter.js';
import { register, installId, ServerError, getLicense, startCheckout, activateLicense, deactivateLicense, sendFeedback } from '../core/server.js';
import { API_BASE } from '../core/config.js';
import { SAMPLES } from '../core/samples.js';
import { t, setLang, resolveLang } from '../i18n/index.js';
import {
  getSettings as readSettings, setSettings, isAllowlisted,
  getCached, setCached, clearCache,
  pushHistory, getHistory, updateHistoryEntry, clearHistory,
  getCommitments, getCommitment, saveCommitment, updateCommitment, deleteCommitment,
  setSnapshotText, getSnapshotText,
} from '../core/storage.js';

const MAX_TERMS_BYTES = 1_500_000;

/**
 * Settings with the language already resolved ("auto" → browser language), which
 * is also the language of the texts produced here: verdicts, notifications, menus.
 */
async function getSettings() {
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
const ANALYSIS_BUDGET_MS = 15_000;
const TERMS_FETCH_BUDGET_MS = 6_000;
const WATCH_ALARM = 'antefirma-controllo-condizioni';
/**
 * A single recurring alarm instead of three alarms per commitment scheduled two
 * years ahead. It fires twice a day: if one pass is skipped — browser closed,
 * update, sleep — the next one catches up.
 */
const SWEEP_ALARM = 'antefirma-passata-quotidiana';

// ── ciclo di vita ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await getSettings();
  setupContextMenus();
  await scheduleAlarms();
  await sweep();
  if (details.reason === 'update') await forgetOldEngine();
  // The token is requested right away, so the first analysis doesn't wait for it too.
  // If the server doesn't answer, it is retried at the first analysis.
  register().catch(() => {});
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
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
      title: t('Analizza il testo selezionato con AnteFirma'),
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-page',
      title: t('Analizza questa pagina (contratto, termini, checkout)'),
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-link',
      title: t('Analizza il documento collegato'),
      contexts: ['link'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    // Safari has no side panel: the same panel opens in a tab.
    if (chrome.sidePanel?.open) await chrome.sidePanel.open({ tabId: tab.id });
    else await chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
  } catch { /* the panel may already be open */ }

  const payload =
    info.menuItemId === 'cf-analyze-selection'
      ? { kind: 'selection', text: info.selectionText || '', url: tab.url, title: tab.title }
      : info.menuItemId === 'cf-analyze-link'
        ? { kind: 'url', url: info.linkUrl }
        : { kind: 'page', tabId: tab.id, url: tab.url, title: tab.title };

  await chrome.storage.session.set({ pendingPanelRequest: { ...payload, at: Date.now() } });
  chrome.runtime.sendMessage({ type: 'PANEL_REQUEST', payload }).catch(() => {});
});

/** The subset of settings a content script really needs. */
async function contentSettings() {
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
      console.error('[AnteFirma]', msg?.type, err);
      sendResponse({ ok: false, error: err?.message || String(err), code: err?.code });
    });
  return true;
});

async function handle(msg, sender) {
  /**
   * `GET_SETTINGS` used to return the **whole** object — API key, name,
   * address, email — and the detector asked for it on every load of every
   * frame. `enabled` and `allowlist` were enough. Besides breaking the Chrome
   * Web Store's minimisation rule, it contradicted what the product says about
   * itself: "no site script can read it".
   *
   * `SET_SETTINGS` also accepted an arbitrary patch: a compromised content
   * script could overwrite the key or switch the firewall off.
   */
  if (!isAllowed(msg?.type, sender, chrome.runtime.id, chrome.runtime.getURL(''))) {
    throw new Error('Messaggio non consentito da una pagina web.');
  }

  switch (msg?.type) {
    case 'GET_CONTENT_SETTINGS':
      return contentSettings();
    case 'ALLOWLIST_ADD':
      return allowlistAdd(msg.payload?.host);
    case 'GRANT_CONSENT':
      return grantConsent();
    case 'REVOKE_CONSENT':
      return setSettings({ remoteConsentAt: null });
    case 'ANALYZE_ACTION':
      return analyzeAction(msg.payload, sender);
    case 'ANALYZE_TEXT':
      return analyzeText(msg.payload);
    case 'ANALYZE_SAMPLE':
      return analyzeSample(msg.payload?.key);
    case 'EXPORT_DATA':
      return exportData();
    case 'IMPORT_DATA':
      return importData(msg.payload);
    case 'FETCH_DOCUMENT':
      return fetchDocument(msg.payload?.url);
    case 'GET_SETTINGS':
      return readSettings();
    case 'SET_SETTINGS': {
      const saved = await setSettings(msg.payload || {});
      // Language changed: context menus are rewritten in the new one.
      if (msg.payload && 'uiLang' in msg.payload) { await getSettings(); setupContextMenus(); }
      return saved;
    }
    case 'GET_HISTORY':
      return getHistory();
    case 'RECORD_DECISION':
      return recordDecision(msg.payload);
    case 'CLEAR_HISTORY':
      return clearHistory();
    case 'CLEAR_CACHE':
      return clearCache();
    case 'SERVER_STATUS':
      return serverStatus();

    // From the warning, with analyses used up: the payment (or settings, if there is already a plan).
    // The page receives neither the purchase code nor the token.
    case 'UPGRADE':
      return upgrade();
    case 'FEEDBACK':
      return withCode(sendFeedback(msg.payload?.category, msg.payload?.model));

    // ── plan (extension pages only) ───────────────────────────────────────
    case 'GET_LICENSE':
      return withCode(getLicense());
    case 'START_CHECKOUT':
      return withCode(startCheckout(['pro', 'max', 'team'].includes(msg.payload?.plan) ? msg.payload.plan : 'pro')
        .then(async (r) => { await chrome.tabs.create({ url: r.url }); await watchCheckout(); return { opened: true }; }));
    case 'ACTIVATE_LICENSE':
      return withCode(activateLicense(msg.payload?.key));
    case 'GET_INSTALL_ID':
      return { installId: await installId() };
    case 'DEACTIVATE_LICENSE':
      return withCode(deactivateLicense());

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

// ── consenso ────────────────────────────────────────────────────────────────

/**
 * Versions up to 0.4 sent the text straight to Anthropic or OpenAI with the
 * person's own key. With the move to the server, who receives the text changed:
 * consent given then doesn't cover this, and the key is no longer needed and
 * must not stay on disk.
 */
async function forgetOldEngine() {
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
async function grantConsent() {
  const remoteConsentAt = new Date().toISOString();
  await setSettings({ remoteConsentAt });
  return { remoteConsentAt };
}

/** Turns a server error into an answer for the interface. */
function failure(err) {
  if (err instanceof ServerError) return { error: { code: err.code, message: err.message, retryAfter: err.retryAfter } };
  return { error: { code: 'internal', message: t('L’analisi non è riuscita.') } };
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
async function analyzeText(payload = {}) {
  const settings = await getSettings();
  const text = normalize(payload.text || '');
  if (text.length < 40) throw new Error(t('Testo troppo breve per un’analisi sensata.'));

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
async function analyzeSample(key) {
  const sample = SAMPLES[key];
  if (!sample) throw new Error(t('Esempio non trovato.'));
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
const EXPORT_KEYS = ['settings', 'history', 'commitments', 'snapshots', 'proceedByHost'];

async function exportData() {
  const data = await chrome.storage.local.get(EXPORT_KEYS);
  if (data.settings) delete data.settings.remoteConsentAt; // consent is given in each installation
  return { app: 'antefirma', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Merges a backup: adds what is missing, deletes nothing that is there. */
async function importData(file) {
  if (!file || file.app !== 'antefirma' || typeof file.data !== 'object') throw new Error(t('Il file non è una copia di AnteFirma.'));
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

// ── decision and commitment register ───────────────────────────────────────

/**
 * `via` doesn't change the decision, it records where it came from: "Continue
 * anyway" (blocked), below threshold (auto), excluded site (allowlist). It keeps
 * history truthful — before, every non-blocking interception stayed with
 * `decision: null` — and will be the basis for measuring false positives.
 */
async function recordDecision({ id, decision, via = null, track = false } = {}) {
  await updateHistoryEntry(id, { decision, via, decidedAt: new Date().toISOString() });
  if (decision !== 'proceed') return { recorded: true, commitment: null };

  const stored = (await chrome.storage.session.get(`verdict:${id}`))[`verdict:${id}`];
  // How many times the user went ahead on this site after a block: at the
  // third, the warning offers to stop warning.
  if (via === 'blocked' && stored?.verdict?.host) {
    const { proceedByHost = {} } = await chrome.storage.local.get('proceedByHost');
    proceedByHost[stored.verdict.host] = (proceedByHost[stored.verdict.host] || 0) + 1;
    await chrome.storage.local.set({ proceedByHost });
  }

  const settings = await getSettings();
  if (!settings.trackCommitments && !track) return { recorded: true, commitment: null };
  if (!stored) return { recorded: true, commitment: null };

  const commitment = await commitmentFromVerdict({ verdict: stored.verdict, text: stored.text, decision });
  // Confirmation: whoever asked for the reminder must know it exists.
  if (track && commitment?.deadlineAt) {
    const when = new Date(commitment.deadlineAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    await notify({
      id: `tracked-${commitment.id}`,
      title: t('Promemoria impostato: {x}', { x: commitment.provider || commitment.host || '' }),
      message: t('Ti avviso prima del {d}, l’ultimo giorno per disdire. Trovi l’impegno nel pannello di AnteFirma.', { d: when }),
      commitmentId: commitment.id, sticky: false,
    });
  }
  return { recorded: true, commitment };
}

/**
 * Creates the commitment: snapshot of the accepted text, computed deadlines,
 * scheduled reminders. The moment a warning turns into something the user
 * will find again two years later.
 */
async function commitmentFromVerdict({ historyId = null, verdict = null, text = '', decision = 'proceed' } = {}) {
  /**
   * The text must be the one actually analysed. The panel always passed the
   * content of the "Paste text" textarea: for an analysis from a PDF, the
   * current page or a URL that textarea is empty, and a zero-character snapshot
   * was born — with the hash of the empty string, which verification declared
   * valid. The full verdict is already in the session together with its text:
   * it is read from there.
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
    throw new Error(t('Testo del contratto non disponibile: senza, la prova non attesterebbe nulla.'));
  }
  const commitment = buildCommitment({ verdict, snapshot, decision });

  // Only commitments with a consequence over time deserve the register.
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
  // Reactivated after an undone cancellation: the plan is computed again from scratch.
  if (updated.status === COMMITMENT_STATUS.ACTIVE && patch.status) return planAndSave(updated);
  return updated;
}

async function removeCommitment(id) {
  return deleteCommitment(id);
}

// ── promemoria ──────────────────────────────────────────────────────────────

/**
 * Reminders are a plan saved with the commitment, not alarms scheduled two
 * years ahead: the daily pass decides what is due. It is a self-healing
 * mechanism — a skipped day is recovered the next day — while a lost alarm is
 * simply lost.
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
 * The pass: looks at every active commitment and decides what to say.
 * One reminder per commitment, the most urgent: after a long browser pause all
 * three would be due, and three notifications in a row about the same contract
 * are the quickest way to get switched off.
 */
async function sweep(now = Date.now()) {
  const settings = await getSettings();
  if (!settings.reminders) return { fired: 0 };

  const list = await getCommitments();
  let fired = 0;

  for (const c of list) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) continue;

    // The window closed while nobody was looking: saying so is unpleasant,
    // but silence means the user finds out from the bank statement.
    if (missedWindow(c, now)) {
      const renewalAmount = c.recurringTotal ?? c.worstCase;
      await notify({
        id: `missed-${c.id}`,
        title: t('{x}: finestra di disdetta chiusa', { x: c.provider || c.host }),
        message: renewalAmount != null
          ? t('Il termine per disdire è passato e il contratto si rinnova: {x}. Apri per vedere cosa puoi ancora fare.', { x: formatMoney(renewalAmount, c.currency) })
          : t('Il termine per disdire è passato. Apri per vedere cosa puoi ancora fare.'),
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
      title: t('Disdetta {x}: mancano {n} giorni', { x: c.provider || c.host, n: due.days }),
      message: renewalAmount != null
        ? `${t('Se non disdici entro il termine, parte un nuovo periodo da {x}.', { x: formatMoney(renewalAmount, c.currency) })} ${state.label}.`
        : `${state.label}. ${t('Apri per generare la lettera di disdetta.')}`,
      commitmentId: c.id,
      kind: 'reminder',
    });

    // Every reminder further away than this counts as used: warning at 30
    // days after already warning at 7 makes no sense.
    const reminders = (c.reminders || []).map((r) => (r.days >= due.days ? { ...r, fired: true } : r));
    await updateCommitment(c.id, { reminders, lastReminder: new Date(now).toISOString() });
    fired += 1;
  }

  return { fired, checked: list.length };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECKOUT_ALARM) return void (await checkCheckout());
  if (alarm.name === SWEEP_ALARM) return void (await sweep());
  if (alarm.name === WATCH_ALARM) return void (await watchAllCommitments());
});

// ── notifiche ───────────────────────────────────────────────────────────────

async function notify({ id, title, message, commitmentId, kind = 'open', sticky = true }) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
      title,
      message,
      priority: 2,
      requireInteraction: sticky,
      // I promemoria di disdetta portano direttamente all'azione.
      buttons: kind === 'reminder'
        ? [{ title: t('Scrivi la lettera') }, { title: t('Ho già disdetto') }]
        : [{ title: t('Apri il kit di uscita') }],
    });
    await chrome.storage.session.set({ [`notif:${id}`]: { commitmentId, kind } });
  } catch (err) {
    // Notifications can be denied by the operating system: a pity, not a fatal
    // error. The deadline stays in the panel and in the calendar.
    console.warn('[AnteFirma] notifica non mostrata:', err?.message);
  }
}

async function notifTarget(notificationId) {
  const map = await chrome.storage.session.get(`notif:${notificationId}`);
  const v = map[`notif:${notificationId}`];
  return typeof v === 'string' ? { commitmentId: v, kind: 'open' } : v || {};
}

async function openCommitment(notificationId, { letter = false } = {}) {
  const { commitmentId } = await notifTarget(notificationId);
  const url = chrome.runtime.getURL(
    `src/sidepanel/sidepanel.html?tab=commitments${commitmentId ? `&id=${commitmentId}` : ''}${letter ? '&letter=1' : ''}`
  );
  chrome.tabs.create({ url });
  chrome.notifications?.clear(notificationId);
}

chrome.notifications?.onClicked.addListener((id) => openCommitment(id));
chrome.notifications?.onButtonClicked.addListener(async (id, index) => {
  const { commitmentId, kind } = await notifTarget(id);
  if (kind === 'reminder' && index === 1 && commitmentId) {
    await updateAndReschedule(commitmentId, { status: COMMITMENT_STATUS.CANCELLED });
    chrome.notifications?.clear(id);
    return;
  }
  openCommitment(id, { letter: kind === 'reminder' && index === 0 });
});

// ── controllo delle modifiche ───────────────────────────────────────────────

/**
 * Re-reads the terms already accepted and compares.
 * The useful message is not "the terms changed" — which says nothing — but
 * "your commitment went from €239.88 to €479.76".
 */
async function checkChanges(id, { trigger = 'manual' } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('Impegno non trovato.'));

  const source = commitment.termsUrl || commitment.url;
  if (!source) throw new Error(t('Per questo impegno non è stato registrato un indirizzo da ricontrollare.'));

  const settings = await getSettings();

  // ── Gate 1: the network. Almost free. ────────────────────────────────────
  // If the server answers 304 the document is identical and nothing was
  // transferred: stop here, without reading, analysing or spending.
  const doc = await fetchDocument(source, commitment.http || {});
  if (doc.notModified) {
    return recordCheck(id, unchangedDiff(t('Il documento non è cambiato dall’ultimo controllo.')), commitment);
  }
  if (!doc.text || doc.text.length < 200) {
    throw new Error(t('Il documento non è più leggibile automaticamente da questo indirizzo.'));
  }
  if (doc.http) await updateCommitment(id, { http: doc.http });

  // ── Gate 2: the fingerprint. Free, all local. ────────────────────────────
  const clean = normalize(doc.text);
  const newHash = await sha256(clean);
  if (commitment.snapshot?.hash && newHash === commitment.snapshot.hash) {
    return recordCheck(id, unchangedDiff(t('Le condizioni sono identiche a quelle che avevi accettato.')), commitment);
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
      ...unchangedDiff(t('Il testo delle condizioni è cambiato. Premi «Verifica modifiche» per sapere se cambia il tuo impegno.')),
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
    title: t('Condizioni cambiate: {x}', { x: commitment.provider || commitment.host }),
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

/** Rebuilds the snapshot of numbers kept in the commitment. */
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
      /* an unreachable site must not stop the others */
    }
  }
}

// ── kit di uscita ───────────────────────────────────────────────────────────

async function letterFor({ id, kind, lang } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('Impegno non trovato.'));
  const settings = await getSettings();
  // The letter's language is the provider's: normally, that of the country chosen in settings.
  return buildLetter(commitment, settings.identity || {}, kind || suggestKind(commitment), Date.now(), lang || letterLangFor(settings.jurisdiction));
}

async function icsFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('Impegno non trovato.'));
  const content = buildIcs(commitment);
  if (!content) throw new Error(t('Questo impegno non ha una scadenza da mettere in calendario.'));
  return { content, filename: `scadenza-${(commitment.provider || 'impegno').toLowerCase()}.ics` };
}

async function proofFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('Impegno non trovato.'));
  const text = await getSnapshotText(id);
  const snapshot = commitment.snapshot || {};

  // Integrity check: the fingerprint is recomputed on the stored text.
  const recomputed = text ? await sha256(text) : null;

  return {
    commitment,
    snapshot,
    text,
    // A snapshot without text cannot be "valid": the fingerprint of the empty
    // string matches itself and would say yes to nothing.
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
 *        When given, the request becomes conditional: a 304 means
 *        "identical" without transferring a byte. It is the cheapest check
 *        there is, and it also reduces the load on the site we are asking.
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
  if (!res.ok) throw new Error(t('Il documento non è raggiungibile (HTTP {n}).', { n: res.status }));

  const http = {
    etag: res.headers.get('etag') || null,
    lastModified: res.headers.get('last-modified') || null,
  };

  const type = res.headers.get('content-type') || '';
  if (type.includes('application/pdf')) {
    return { url: res.url, isPdf: true, text: '', note: t('PDF: aprilo nel pannello laterale per l’analisi.') };
  }

  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_TERMS_BYTES ? buf.slice(0, MAX_TERMS_BYTES) : buf;
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  const text = type.includes('text/plain') ? normalize(raw) : htmlToText(raw);

  return { url: res.url, isPdf: false, text, chars: text.length, http, truncated: buf.byteLength > MAX_TERMS_BYTES };
}

// ── varie ───────────────────────────────────────────────────────────────────

/** Does the server answer? Used by settings, costs no analysis. */
// ── after payment ───────────────────────────────────────────────────────────

/**
 * After the payment opens, the plan is checked every minute for half an hour:
 * as soon as it is active, a notification confirms it. Whoever paid must not
 * wonder whether they have to do something else.
 */
const CHECKOUT_ALARM = 'antefirma-attesa-pagamento';
async function watchCheckout() {
  await chrome.storage.local.set({ checkoutUntil: Date.now() + 30 * 60_000 });
  await chrome.alarms.create(CHECKOUT_ALARM, { periodInMinutes: 1 });
}
async function checkCheckout() {
  const { checkoutUntil = 0 } = await chrome.storage.local.get('checkoutUntil');
  const done = async () => { await chrome.alarms.clear(CHECKOUT_ALARM); await chrome.storage.local.remove('checkoutUntil'); };
  if (Date.now() > checkoutUntil) return done();
  const lic = await getLicense().catch(() => null);
  if (lic && lic.plan && lic.plan !== 'free') {
    await done();
    await showQuotaBadge(null);
    const name = { pro: 'Pro', max: 'Max', team: 'Team' }[lic.plan] || lic.plan;
    await notify({ id: `plan-${Date.now()}`, title: t('{x} attivo su questo browser ✓', { x: name }), message: t('Grazie! Puoi chiudere la pagina del pagamento e tornare dove stavi: AnteFirma continua da solo.'), commitmentId: null, sticky: false });
  }
}

/**
 * The badge used to show the free analyses left. Tabs with a verdict show their
 * level: that applies only to that tab.
 */
async function showQuotaBadge(quota) {
  if (!chrome.action?.setBadgeText) return;
  // Analyses left are shown in the panel: a red number on the icon looks like an error or a notification.
  // Here we only clear what earlier versions wrote.
  void quota;
  try { await chrome.action.setBadgeText({ text: '' }); } catch { /* no icon to update */ }
}

async function upgrade() {
  const lic = await withCode(getLicense());
  if (lic?.plan && lic.plan !== 'free') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#piano') });
    return { where: 'options' };
  }
  const r = await withCode(startCheckout('pro'));
  if (r.error) return r;
  await chrome.tabs.create({ url: r.url });
  await watchCheckout();
  return { where: 'checkout' };
}

/** Server errors reach the page as { error, message }, not as exceptions. */
async function withCode(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ServerError) return { error: err.code, message: err.message };
    throw err;
  }
}

async function serverStatus() {
  try {
    const res = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function updateBadge(tabId, level) {
  if (!tabId || !chrome.action?.setBadgeText) return;
  const text = { safe: '', review: '!', commitment: '!!', high_risk: '!!!', critical: '⛔' }[level.id] ?? '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: level.color });
  } catch { /* the tab may already be closed */ }
}

function cacheKey(text, actionType, settings) {
  return `${hashText(text)}|${actionType}|${settings.jurisdiction}|${settings.uiLang || 'it'}|${profileKey(settings.profile)}`;
}

function profileKey(profile = {}) {
  return Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(',');
}

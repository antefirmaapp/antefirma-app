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
 *
 * This file registers the listeners and routes messages; the work lives in
 * settings.js, analysis.js, commitments.js (register, reminders, notifications),
 * changes.js (terms check), exit-kit.js and plan.js.
 */
import { isAllowed } from '../core/sender.js';
import { jurisdictionFor } from '../core/jurisdiction.js';
import { COMMITMENT_STATUS } from '../core/commitments.js';
import { register, installId, getLicense, startCheckout, activateLicense, deactivateLicense, sendFeedback } from '../core/server.js';
import { t } from '../i18n/index.js';
import { getSettings as readSettings, setSettings, clearCache, getHistory, clearHistory, getCommitments } from '../core/storage.js';
import { getSettings, contentSettings, allowlistAdd, forgetOldEngine, grantConsent, withCode, serverStatus } from './settings.js';
import { analyzeAction, analyzeText, analyzeSample, exportData, importData } from './analysis.js';
import { recordDecision, commitmentFromVerdict, updateAndReschedule, removeCommitment, WATCH_ALARM, SWEEP_ALARM, scheduleAlarms, sweep, notifTarget, openCommitment } from './commitments.js';
import { checkChanges, watchAllCommitments, fetchDocument } from './changes.js';
import { letterFor, icsFor, proofFor } from './exit-kit.js';
import { CHECKOUT_ALARM, watchCheckout, checkCheckout, upgrade } from './plan.js';

// ── lifecycle ───────────────────────────────────────────────────────────────

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
    await setSettings({ jurisdiction: jurisdictionFor(chrome.i18n?.getUILanguage?.()) });
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
      title: t('analyseSelectedTextAntefirma'),
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-page',
      title: t('analysePageContractTermsCheckout'),
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'cf-analyze-link',
      title: t('analyseLinkedDocument'),
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

// ── message router ──────────────────────────────────────────────────────────

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
    throw new Error('Message not allowed from a web page.');
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

    // ── exit kit ───────────────────────────────────────────────────────────
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
      throw new Error(`Unknown message: ${msg?.type}`);
  }
}

// ── alarms ──────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECKOUT_ALARM) return void (await checkCheckout());
  if (alarm.name === SWEEP_ALARM) return void (await sweep());
  if (alarm.name === WATCH_ALARM) return void (await watchAllCommitments());
});

// ── notifications ───────────────────────────────────────────────────────────

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

/**
 * Settings page.
 */

import { PROTECTION_LABELS } from '../core/constants.js';
import { t, setLang, resolveLang, locale, getLang } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';
import { helpUrl } from '../core/help.js';

const $ = (s) => document.querySelector(s);

const AREA_HINTS = {
  money: 'subscriptionsRenewalsFeesHiddenCosts',
  privacy: 'dataSharingProfilingRetention',
  ip: 'licencesContentTransfersRightsUseTrain',
  freelance: 'workSellPhotosWritingCodeProjects',
  business: 'companyDataDocumentsLiabilityConfidentiality',
  minors: 'accountsDataChildrenUnderageRelatives',
  identity: 'arbitraryAccountClosureWaivedRightsForeign',
};

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res) throw new Error(t('noReplyFromEngine'));
  if (!res.ok) throw new Error(res.error);
  return res.result;
}

function buildProfileGrid(profile) {
  $('#profile-grid').innerHTML = Object.entries(PROTECTION_LABELS)
    .map(
      ([key, label]) => `<label class="area">
        <input type="checkbox" data-area="${key}" ${profile[key] ? 'checked' : ''}>
        <span>
          <strong>${t(label)}</strong>
          <em>${AREA_HINTS[key] ? t(AREA_HINTS[key]) : ''}</em>
        </span>
      </label>`
    )
    .join('');
}

function readProfile() {
  const out = {};
  for (const cb of document.querySelectorAll('[data-area]')) out[cb.dataset.area] = cb.checked;
  return out;
}

async function load() {
  const s = await send('GET_SETTINGS');

  $('#enabled').checked = s.enabled;
  $('#blockFrom').value = s.blockFrom;
  $('#jurisdiction').value = s.jurisdiction;
  $('#minBlockAmount').value = s.minBlockAmount || '';
  $('#uiLang').value = s.uiLang || 'auto';
  $('#trackCommitments').checked = s.trackCommitments;
  $('#reminders').checked = s.reminders;
  $('#watchChanges').checked = s.watchChanges;
  $('#watchUsesRemote').checked = s.watchUsesRemote;
  $('#id-name').value = s.identity?.name || '';
  $('#id-email').value = s.identity?.email || '';
  $('#id-address').value = s.identity?.address || '';
  $('#id-customer').value = s.identity?.customerId || '';
  showConsent(s.remoteConsentAt);
  $('#allowlist').value = (s.allowlist || []).join('\n');

  buildProfileGrid(s.profile);
}

/**
 * Page text leaves the browser only after an explicit yes: here, or in the
 * warning at the first analysis. The date stays recorded.
 */
function showConsent(at) {
  const box = $('#consent-box');
  if (at) {
    box.className = 'key-status ok';
    box.textContent = t('consentedAnalysisD', { d: new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) });
  } else {
    box.className = 'key-status';
    box.textContent = t('havenTConsentedYetILl');
  }
  $('#grant-consent').hidden = Boolean(at);
  $('#revoke-consent').hidden = !at;
}

/** Does the server answer? A check that costs no analysis. */
async function showServerStatus() {
  const el = $('#server-status');
  try {
    const st = await send('SERVER_STATUS');
    el.textContent = st.ok ? t('reachable') : t('notReachableRightNow');
    el.className = st.ok ? 'srv-ok' : 'srv-bad'; // colours in options.css, light and dark
  } catch (err) {
    el.textContent = t('canTCheckX', { x: err.message });
  }
}

async function save() {
  const btn = $('#save');
  btn.disabled = true;
  try {
    await send('SET_SETTINGS', {
      enabled: $('#enabled').checked,
      blockFrom: $('#blockFrom').value,
      jurisdiction: $('#jurisdiction').value,
      minBlockAmount: Math.max(0, Number($('#minBlockAmount').value) || 0),
      uiLang: $('#uiLang').value,
      trackCommitments: $('#trackCommitments').checked,
      reminders: $('#reminders').checked,
      watchChanges: $('#watchChanges').checked,
      watchUsesRemote: $('#watchUsesRemote').checked,
      identity: {
        name: $('#id-name').value.trim(),
        email: $('#id-email').value.trim(),
        address: $('#id-address').value.trim(),
        customerId: $('#id-customer').value.trim(),
      },
      allowlist: $('#allowlist').value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      profile: readProfile(),
    });
    // Language changed: the page is redrawn in the new one.
    if ($('#uiLang').value !== initialLang) { location.reload(); return; }
    flash(t('saved'));
  } catch (err) {
    flash(t('errorX', { x: err.message }));
  } finally {
    btn.disabled = false;
  }
}

function flash(message) {
  const el = $('#save-status');
  el.textContent = message;
  setTimeout(() => {
    if (el.textContent === message) el.textContent = '';
  }, 3000);
}

// ── events ──────────────────────────────────────────────────────────────────

// ── plan ────────────────────────────────────────────────────────────────────

const PLAN_NAMES = { free: 'free', pro: 'Pro', max: 'Max', team: 'Team' };
const planName = (p) => (PLAN_NAMES[p] ? t(PLAN_NAMES[p]) : p);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function planStatus(text, ok) {
  const el = $('#plan-status');
  el.hidden = !text;
  el.textContent = text || '';
  el.className = `key-status ${ok ? 'ok' : 'err'}`;
}

async function showPlan() {
  let lic;
  try { lic = await send('GET_LICENSE'); } catch (err) { $('#plan-summary').textContent = t('canTCheckPlanX', { x: err.message }); return; }
  if (lic.notice) showNotice(lic.notice);
  if (lic.error) { $('#plan-summary').textContent = lic.message; $('#plan-buy').hidden = lic.error === 'billing_off'; return; }
  const m = lic.quota?.month;
  const left = m ? ' ' + t('bAnalysesLeftMonth', { a: m.remaining, b: m.limit }) : '';
  if (lic.plan === 'free') {
    $('#plan-summary').textContent = t('freePlan') + left;
  } else {
    const when = lic.cancelAt ? ' ' + t('cancelledStaysActiveUntilD', { d: day(lic.cancelAt) }) : lic.periodEnd ? ' ' + t('renewsD', { d: day(lic.periodEnd) }) : '';
    const where = lic.activations ? ' ' + t('activeBBrowsers', { a: lic.activations.used, b: lic.activations.limit }) : '';
    $('#plan-summary').textContent = `${planName(lic.plan)}.${left}${where}${when}`;
  }
  const paid = lic.plan !== 'free';
  $('#plan-buy').hidden = paid;
  $('#plan-buy-note').hidden = paid;
  $('#plan-remove').hidden = !paid;
}

document.querySelectorAll('#plan-buy [data-plan]').forEach((b) => b.addEventListener('click', async () => {
  b.disabled = true;
  try {
    const r = await send('START_CHECKOUT', { plan: b.dataset.plan });
    if (r.error) planStatus(r.message, false);
    else planStatus(t('paymentPageOpenedWhenReDone'), true);
  } catch (err) { planStatus(err.message, false); }
  b.disabled = false;
}));

$('#plan-activate').addEventListener('click', async () => {
  const key = $('#plan-key').value.trim();
  if (!key) { planStatus(t('typeKey'), false); return; }
  try {
    const r = await send('ACTIVATE_LICENSE', { key });
    if (r.error) { planStatus(r.message, false); return; }
    $('#plan-key').value = '';
    planStatus(t('keyActivatedXBrowser', { x: planName(r.plan) }), true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

$('#plan-remove').addEventListener('click', async () => {
  if (!confirm(t('removePlanFromBrowserKeyStays'))) return;
  try {
    const r = await send('DEACTIVATE_LICENSE');
    if (r.error) { planStatus(r.message, false); return; }
    planStatus(t('planRemovedFromBrowser'), true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

/** AnteFirma's message to users, if one is in force. */
function showNotice(n) {
  let el = document.getElementById('af-notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'af-notice';
    el.setAttribute('role', 'note');
    document.querySelector('.wrap, main, body > div')?.prepend(el);
  }
  el.className = `key-status ${n.level === 'warn' ? 'err' : 'ok'}`;
  el.textContent = n[getLang()] || n.it;
}

async function showInstallId() {
  try {
    const { installId } = await send('GET_INSTALL_ID');
    $('#install-id').textContent = installId;
    $('#copy-install-id').addEventListener('click', () => navigator.clipboard?.writeText(installId).then(() => flash(t('codeCopied'))));
  } catch { $('#install-id').textContent = '—'; }
}

// Back from the payment page, the plan refreshes by itself.
document.addEventListener('visibilitychange', () => { if (!document.hidden) showPlan(); });

$('#save').addEventListener('click', save);

// Saves by itself: checkboxes and menus at once, text fields when you leave them. "Save" stays for those who look for it.
// Not the language: changing it redraws the page, so "Save" does it, when you are done.
const AUTO = '#enabled, #blockFrom, #jurisdiction, #minBlockAmount, #trackCommitments, #reminders, #watchChanges, #watchUsesRemote, #id-name, #id-email, #id-address, #id-customer, #allowlist, #profile-grid input';
let autoTimer = null;
document.addEventListener('change', (e) => {
  if (!e.target.matches?.(AUTO)) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(save, 250);
});
$('#uiLang').addEventListener('change', () => { $('#save-status').textContent = t('pressSaveChangeLanguage'); });
document.addEventListener('input', (e) => {
  if (e.target.matches?.(AUTO) && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') $('#save-status').textContent = t('unsavedChanges');
});

$('#grant-consent').addEventListener('click', async () => {
  const { remoteConsentAt } = await send('GRANT_CONSENT');
  showConsent(remoteConsentAt);
});

$('#revoke-consent').addEventListener('click', async () => {
  await send('REVOKE_CONSENT');
  showConsent(null);
  flash(t('consentWithdrawnNoTextWillSent'));
});

$('#clear-cache').addEventListener('click', async () => {
  await send('CLEAR_CACHE');
  flash(t('cacheCleared'));
});

$('#clear-history').addEventListener('click', async () => {
  await send('CLEAR_HISTORY');
  flash(t('historyDeleted'));
});

// The data backup: a JSON file, without the installation identity or the licence.
$('#export-data').addEventListener('click', async () => {
  try {
    const data = await send('EXPORT_DATA');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `antefirma-dati-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash(t('dataDownloaded'));
  } catch (err) { flash(err.message); }
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await send('IMPORT_DATA', JSON.parse(await file.text()));
    flash(t('loadedCommitmentsBHistoryEntriesExisting', { a: r.commitments, b: r.history }));
    load();
  } catch (err) { flash(err instanceof SyntaxError ? t('fileNotAntefirmaBackup') : err.message); }
});

/** The web version: no firewall, so other headings and another explanation of the analysis. */
function adaptForWeb() {
  if (document.documentElement.dataset.web !== '1') return;
  const prot = $('#enabled')?.closest('section')?.querySelector('h2');
  if (prot) prot.textContent = t('languageCountry');
  const lead = $('#consent-box')?.closest('section')?.querySelector('p.lead');
  if (lead) lead.textContent = t('whenPressAnalyseAntefirmaSendsText');
  // Web version reminders are browser notifications: they need permission and an open window.
  const rem = $('#reminders');
  rem?.addEventListener('change', () => { if (rem.checked && 'Notification' in self && Notification.permission === 'default') Notification.requestPermission(); });
  const em = rem?.closest('label')?.querySelector('em');
  if (em) em.textContent = t('notifications3071DayBefore2');
}

if (new URLSearchParams(location.search).has('welcome')) {
  $('#welcome').hidden = false;
}

/**
 * The section index: fixed on the left on wide screens, with the section in
 * view highlighted. On narrow screens it isn't there (CSS).
 */
function addToc() {
  const nav = document.createElement('nav');
  nav.className = 'toc';
  nav.setAttribute('aria-label', t('sections'));
  const links = [];
  for (const sec of document.querySelectorAll('section.card')) {
    const h = sec.querySelector('h2');
    if (!h || sec.hidden) continue;
    if (!sec.id) sec.id = 's-' + (h.dataset.help || links.length);
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    a.textContent = h.firstChild?.textContent.trim() || h.textContent.trim();
    nav.append(a);
    links.push([sec, a]);
  }
  document.body.append(nav);
  // Highlighted: the last section whose heading has passed a third of the window.
  const mark = () => {
    let cur = links[0]?.[0];
    for (const [sec] of links) if (sec.getBoundingClientRect().top <= innerHeight / 3) cur = sec;
    for (const [sec, a] of links) a.classList.toggle('on', sec === cur);
  };
  addEventListener('scroll', mark, { passive: true });
  mark();
}

/** A "?" next to each section heading: opens the guide on that topic. */
function addHelpLinks() {
  for (const h of document.querySelectorAll('h2[data-help]')) {
    const a = document.createElement('a');
    a.className = 'help-q'; a.textContent = '?'; a.target = '_blank'; a.rel = 'noopener';
    a.href = helpUrl(h.dataset.help, getLang());
    a.title = a.ariaLabel = t('helpS', { s: h.textContent.trim() });
    h.append(' ', a);
  }
}

// Language first: the page is written in Italian and translated here.
let initialLang = 'auto';
(async () => {
  try {
    const s = await send('GET_SETTINGS');
    initialLang = s.uiLang || 'auto';
    setLang(resolveLang(initialLang, chrome.i18n.getUILanguage()));
  } catch { /* Italian stays */ }
  translateDom(document.body);
  document.title = t('antefirmaSettings');
  adaptForWeb();
  addHelpLinks();
  addToc();
  load();
  showServerStatus();
  showPlan();
  showInstallId();
})();

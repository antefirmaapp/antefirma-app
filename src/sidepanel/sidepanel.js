/**
 * Side panel: the four ways into the analysis (page, pasted text, PDF, URL)
 * and the history of commitments.
 */

import { renderVerdict, esc } from './render.js';
import * as commitments from './commitments-ui.js';
import { extractPdfText } from '../lib/pdf-text.js';
import { formatMoney } from '../core/text.js';
import { t, setLang, resolveLang, locale, getLang } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';
import { SAMPLES } from '../core/samples.js';
import { helpUrl } from '../core/help.js';

const $ = (sel) => document.querySelector(sel);
const state = { source: null, busy: false };
/** The web version (web.antefirma.app): same panel, without what a web page cannot do. */
const isWeb = document.documentElement.dataset.web === '1';

// ── infrastruttura ──────────────────────────────────────────────────────────

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res) throw new Error(t('noReplyFromEngine'));
  if (!res.ok) throw Object.assign(new Error(res.error), { code: res.code });
  return res.result;
}

function status(message, kind = 'info') {
  const el = $('#status');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.className = `status${kind === 'error' ? ' error' : ''}`;
  el.textContent = message;
}

let lastVerdict = null;

function showResult(verdict) {
  lastVerdict = verdict;
  // An example is not your contract: you look at it, you don't record it.
  const trackable = !verdict.example && (verdict.cost?.horizonMonths || verdict.cost?.hasAutoRenewal || verdict.cost?.worstCase != null);
  if (verdict.engine?.quota) paintQuota(verdict.engine.quota);
  $('#result').innerHTML =
    (verdict.example ? `<div class="status example-note">${esc(t('exampleMadeUpContractNoAnalysis'))}</div>` : '') +
    renderVerdict(verdict) +
    (trackable
      ? `<button class="primary" id="track" style="margin-top:10px;width:100%">${esc(t('recordCommitmentRemindMe'))}</button>`
      : '');
  if (trackable) $('#track').addEventListener('click', trackCurrent);
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * A manual analysis can also become a deadline to watch: the case of a
 * contract that reaches you by email and that you sign elsewhere.
 */
async function trackCurrent() {
  const btn = $('#track');
  btn.disabled = true;
  try {
    // The service worker finds the text from the verdict in the session: the
    // textarea's text is that of *one* of the four sources, not necessarily the
    // one that produced this verdict.
    const saved = await send('SAVE_COMMITMENT_FROM_VERDICT', {
      historyId: lastVerdict?.historyId,
      verdict: lastVerdict,
      decision: 'manual',
    });
    if (!saved) {
      status(t('textShowsNoDeadlineKeepEye'), 'error');
      btn.disabled = false;
      return;
    }
    btn.textContent = t('savedCommitments');
    offerCalendar(saved);
    await commitments.load();
  } catch (err) {
    status(err.message, 'error');
    btn.disabled = false;
  }
}

/**
 * Right after saving, the deadline in the calendar: the only reminder that
 * arrives with the browser closed too. Google Calendar or an .ics file.
 */
function offerCalendar(c) {
  if (!c?.deadlineAt || $('#cal-offer')) return;
  const day = new Date(c.deadlineAt);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const next = new Date(day.getTime() + 86400000);
  const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE',
    text: t('cancelXLastDay', { x: c.provider || c.host || '' }).trim(),
    dates: `${ymd(day)}/${ymd(next)}`,
    details: t('lastDaySendCancellationReminderCreated'),
  }).toString();
  const box = document.createElement('div');
  box.id = 'cal-offer';
  box.className = 'cal-offer';
  box.innerHTML = `<p>${esc(t('putCalendarTooRemindsEvenWhen'))}</p>
    <div class="row"><a class="secondary btn-like" href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a>
    <button class="secondary" id="cal-ics">${esc(t('appleOutlookOthersIcs'))}</button></div>`;
  $('#track').after(box);
  $('#cal-ics').addEventListener('click', async () => {
    try {
      const { content, filename } = await send('BUILD_ICS', { id: c.id });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
      a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { status(err.message, 'error'); }
  });
}

/** Analyses left, in the header: visible before running out, not after. */
function paintQuota(q) {
  const m = q?.month;
  if (!m || m.limit == null || m.remaining == null) return;
  let el = $('#quota');
  if (!el) {
    el = document.createElement('button');
    el.id = 'quota';
    el.className = 'quota';
    el.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#piano') }));
    $('#open-help').before(el);
  }
  el.textContent = t('nMAnalysesLeftMonth', { n: m.remaining, m: m.limit });
  el.dataset.limit = m.limit;
  el.classList.toggle('low', m.remaining <= 1);
}

/** At the bottom: the chosen protections, in words and clickable, and whether consent is still missing. */
function engineNote(settings) {
  const code = settings.jurisdiction || 'IT';
  let country = code;
  try { country = new Intl.DisplayNames([getLang()], { type: 'region' }).of(code === 'UK' ? 'GB' : code) || code; } catch { /* keep the code */ }
  const el = $('#engine-note');
  el.innerHTML = `<button class="link" id="note-country" title="${esc(t('changeSettings'))}">${esc(t('protectionsX', { x: country }))}</button>` +
    (settings.remoteConsentAt ? '' : ' · ' + esc(t('iLlAskConsentFirstAnalysis')));
  $('#note-country').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#tutele') }));
}

/** A ready-made example: same computation, no text sent, no analysis used. */
async function runSample(key) {
  const sample = SAMPLES[key];
  if (!sample || state.busy) return;
  selectTab('analyze');
  if (!isWeb) selectSource('paste');
  const s = sample.langs[getLang()] || sample.langs.it;
  $('#paste-text').value = s.text;
  $('#paste-price').value = sample.pricing?.amount ? String(sample.pricing.amount).replace('.', ',') : '';
  $('#paste-period').value = sample.pricing?.period || '';
  document.querySelectorAll('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === key)));
  state.busy = true;
  status(t('analysingExample'));
  try {
    showResult(await send('ANALYZE_SAMPLE', { key }));
    status(null);
  } catch (err) {
    status(err.message, 'error');
  } finally {
    state.busy = false;
  }
}

/**
 * Consent at the first analysis, asked from the panel. The text goes to the
 * AnteFirma server only after a yes.
 */
function askConsent() {
  return new Promise((resolve) => {
    commitments.openModal(
      t('canIReadText'),
      `<p>${esc(t('tellWhatReCommittingAntefirmaSends'))}</p>
       <p>${esc(t('serverKeepsNeitherTextNorAddress'))}</p>`,
      [
        { label: t('notNow'), act: () => { commitments.closeModal(); resolve(false); } },
        {
          label: t('yesAnalyse'),
          act: async () => {
            commitments.closeModal();
            try {
              await send('GRANT_CONSENT');
              send('GET_SETTINGS').then(engineNote).catch(() => {});
              resolve(true);
            } catch {
              resolve(false);
            }
          },
        },
      ]
    );
    // "Close", added by the dialog itself, counts as a no.
    document.querySelector('#modal-foot button:last-child')?.addEventListener('click', () => resolve(false), { once: true });
  });
}

async function analyze(payload, label) {
  if (state.busy) return;
  state.busy = true;
  status(label || t('analysing'));
  $('#result').innerHTML = '';
  try {
    let verdict = await send('ANALYZE_TEXT', payload);
    if (verdict?.needsConsent) {
      status(null);
      if (!(await askConsent())) {
        status(t('withoutConsentTextIsnTSent'), 'error');
        return;
      }
      status(label || t('analysing'));
      verdict = await send('ANALYZE_TEXT', payload);
    }
    status(null);
    showResult(verdict);
  } catch (err) {
    if (err.code === 'quota_month') quotaOut(); else status(err.message || t('analysisFailed2'), 'error');
  } finally {
    state.busy = false;
  }
}

/** This month's analyses are used up: not an error. When they come back and what can be done meanwhile. */
function quotaOut() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const el = $('#status');
  el.hidden = false;
  el.className = 'status quota-out';
  el.innerHTML = `<b>${esc(t('monthSFreeAnalysesUsedUp'))}</b>
    <span>${esc(t('theyComeBackDExamplesAlways', { d: next.toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) }))}</span>
    <span class="row"><button class="secondary" id="qo-sample">${esc(t('tryExample3'))}</button>
    <button class="primary" id="qo-plans">${esc(t('seePlans'))}</button></span>`;
  $('#qo-sample').addEventListener('click', () => { status(null); runSample('gym'); });
  $('#qo-plans').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#piano') }));
  paintQuota({ month: { limit: Number($('#quota')?.dataset.limit) || 5, remaining: 0 } });
}

// ── selezione della sorgente ────────────────────────────────────────────────

const BLOCKS = { paste: '#input-paste', pdf: '#input-pdf', url: '#input-url' };

function selectSource(source) {
  state.source = source;
  for (const btn of document.querySelectorAll('.source')) {
    btn.classList.toggle('active', btn.dataset.source === source);
  }
  for (const [key, sel] of Object.entries(BLOCKS)) {
    $(sel).hidden = key !== source;
  }
}

document.querySelectorAll('.source').forEach((btn) => {
  btn.addEventListener('click', () => {
    const source = btn.dataset.source;
    selectSource(source);
    if (source === 'page') analyzeCurrentPage();
    if (source === 'paste') $('#paste-text').focus();
    if (source === 'url') $('#url-input').focus();
  });
});

// ── 1. pagina corrente ──────────────────────────────────────────────────────

async function analyzeCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    status(t('pageCanTAnalysedIsnT'), 'error');
    return;
  }
  status(t('readingPage'));
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const text = document.body?.innerText || '';
        const CF = globalThis.__CF;
        // If the content script is present, reuse its price extractor.
        const pricing = CF?.context ? CF.context.extractPricing(document.body) : {};
        return { text: text.slice(0, 120000), pricing, title: document.title, url: location.href };
      },
    });
    if (!result?.text || result.text.trim().length < 60) {
      status(t('iDidnTFindEnoughText'), 'error');
      return;
    }
    await analyze(
      { text: result.text, url: result.url, title: result.title, pricing: result.pricing, actionType: 'manual' },
      t('analysingPage')
    );
  } catch (err) {
    status(t('iCanTReadPageX', { x: err.message }), 'error');
  }
}

// ── 2. testo incollato ──────────────────────────────────────────────────────

$('#run-paste').addEventListener('click', () => {
  const text = $('#paste-text').value.trim();
  if (text.length < 40) {
    status(t('iNeedBitMoreTextSay'), 'error');
    return;
  }
  const priceRaw = $('#paste-price').value.trim();
  const amount = priceRaw ? Number.parseFloat(priceRaw.replace(/[^\d.,]/g, '').replace(',', '.')) : null;
  const period = $('#paste-period').value || null;
  analyze(
    {
      text,
      actionType: period ? 'subscribe' : 'manual',
      pricing: Number.isFinite(amount) ? { amount, currency: 'EUR', period, recurring: Boolean(period) } : {},
    },
    t('analysingText')
  );
});

// From the text box, Ctrl+Enter (⌘+Enter on Mac) analyses.
$('#paste-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#run-paste').click(); }
});

// ── 3. PDF ──────────────────────────────────────────────────────────────────

const dropzone = $('#dropzone');

$('#pick-pdf').addEventListener('click', () => $('#pdf-file').click());
$('#pdf-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handlePdf(file);
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('over');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handlePdf(file);
});

// Dropping the PDF anywhere in the panel works too.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type === 'application/pdf') {
    if (!isWeb) selectSource('pdf');
    handlePdf(file);
  }
});

async function handlePdf(file) {
  if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    status(t('fileIsnTPdf'), 'error');
    return;
  }
  status(`Leggo ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const { text, pages, reliable, note } = await extractPdfText(buffer);
    if (!text || text.length < 60) {
      status(note || t('iCouldnTExtractTextFrom'), 'error');
      return;
    }
    if (!reliable && note) status(note, 'error');
    await analyze(
      { text, title: file.name, actionType: 'sign', ctx: { source: 'pdf', pages } },
      `Analizzo ${file.name} (${pages} pagine)…`
    );
  } catch (err) {
    status(err.message || t('couldnTReadPdf'), 'error');
  }
}

// ── 4. URL ──────────────────────────────────────────────────────────────────

$('#run-url').addEventListener('click', async () => {
  const url = $('#url-input').value.trim();
  if (!url) return;
  status(t('downloadingDocument'));
  try {
    const doc = await send('FETCH_DOCUMENT', { url });
    if (doc.isPdf) {
      status(t('sPdfDownloadDragHereSo'), 'error');
      return;
    }
    if (!doc.text || doc.text.length < 60) {
      status(t('documentHasNoTextAnalyse'), 'error');
      return;
    }
    await analyze({ text: doc.text, url: doc.url, title: url, actionType: 'manual' }, t('analysingDocument'));
  } catch (err) {
    status(err.message, 'error');
  }
});

// ── schede e storico ────────────────────────────────────────────────────────

const TABS = [...document.querySelectorAll('.tab')];

/**
 * The `.active` class is for the eyes; `aria-selected` is the only thing a
 * screen reader reads. The roving `tabindex` serves the rest of the pattern:
 * inside the bar you move with the arrows, not with Tab, which must jump
 * straight to the open tab's content.
 */
/** The "?" opens the guide of the open tab. */
const HELP_OF_TAB = { analyze: 'analysing', commitments: 'commitments', history: 'troubleshooting' };
function selectTab(name, { focus = false } = {}) {
  const help = document.getElementById('open-help');
  if (help) help.href = helpUrl(HELP_OF_TAB[name] || '', getLang());
  for (const t of TABS) {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !on;
    if (on && focus) t.focus();
  }
  if (name === 'history') loadHistory();
  if (name === 'commitments') commitments.load();
}

TABS.forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
});

$('.tabs').addEventListener('keydown', (e) => {
  const current = TABS.indexOf(document.activeElement);
  if (current < 0) return;
  const last = TABS.length - 1;
  let next = null;
  if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
  if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = last;
  if (next == null) return;
  e.preventDefault();
  selectTab(TABS[next].dataset.tab, { focus: true });
});

const LEVEL_COLORS = {
  safe: '#1a7f52',
  review: '#b8860b',
  commitment: '#c2620f',
  high_risk: '#c0392b',
  critical: '#7d0a0a',
};

async function loadHistory() {
  const list = await send('GET_HISTORY');
  const el = $('#history-list');
  if (!list.length) {
    el.innerHTML = isWeb
      ? `<div class="empty">${esc(t('analysesAppearHereDeadlinesRemember'))}<p class="muted small"><button class="link" data-try-sample="gym">${esc(t('tryExample'))}</button></p></div>`
      : `<div class="empty">${esc(t('noCommitmentsRecorded'))}<br>${esc(t('historyFillsUpWhenFirewallSteps'))}<p class="muted small"><a href="https://antefirma.app/demo/" target="_blank" rel="noopener">${esc(t('tryDemoPage'))}</a></p></div>`;
    return;
  }

  const now = Date.now();
  el.innerHTML = groupHistory(list)
    .map(({ h, count }) => {
      const when = new Date(h.at);
      const deadline = h.deadline ? new Date(h.deadline) : null;
      const daysLeft = deadline ? Math.round((deadline - now) / 86400000) : null;
      // `data-level` is not decoration: in the dark theme sidepanel.css uses it
      // to replace the light colour with a variant readable on the background.
      return `<div class="h-item" data-level="${esc(h.level || '')}" style="--level-color:${LEVEL_COLORS[h.level] || '#888'}">
        <div class="h-top">
          <span>${esc(h.host || '—')}</span>
          <span>${when.toLocaleDateString(locale())}</span>
        </div>
        <div class="h-title">${esc(h.headline || '')}</div>
        ${h.worstCase ? `<div class="h-cost">${esc(t('estimatedCommitmentX', { x: formatMoney(h.worstCase, h.currency || 'EUR') }))}</div>` : ''}
        ${deadline && daysLeft != null ? `<div class="h-deadline">⏰ ${esc(t('cancelD', { d: deadline.toLocaleDateString(locale()) }))}${esc(daysLeft >= 0 ? ' — ' + t('nDays', { n: daysLeft }) : ' — ' + t('expired'))}</div>` : ''}
        ${h.mustRemember && !deadline ? `<div class="h-deadline">📌 ${esc(h.mustRemember)}</div>` : ''}
        <div class="h-decision">${esc(decisionLabel(h))}${count > 1 ? ` · <span class="h-count">${esc(t('nTimes', { n: count }))}</span>` : ''}</div>
      </div>`;
    })
    .join('');
}

/**
 * The same warning on the same site, on the same day and with the same decision
 * (someone retrying a purchase, reloading the page) becomes one card: "5 times".
 */
function groupHistory(list) {
  const out = [];
  for (const h of list) {
    const day = new Date(h.at).toDateString();
    const key = [h.host, h.headline, h.decision, h.via, day].join('|');
    const last = out[out.length - 1];
    if (last && last.key === key) last.count++;
    else out.push({ key, h, count: 1 });
  }
  return out;
}

/** What really happened, not only whether the user went ahead. */
function decisionLabel(h) {
  if (h.decision === 'cancel') return t('stopped');
  if (h.decision !== 'proceed') return t('noDecisionRecorded');
  if (h.via === 'auto') return t('wentAheadWithoutBlock');
  if (h.via === 'allowlist') return t('wentAheadSiteExcludedFromWarnings');
  return t('wentAhead');
}

$('#clear-history').addEventListener('click', async () => {
  await send('CLEAR_HISTORY');
  loadHistory();
});

$('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ── requests arriving from the context menu ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PANEL_REQUEST') handlePanelRequest(msg.payload);
});

async function handlePanelRequest(req) {
  if (!req) return;
  if (req.kind === 'selection' && req.text) {
    selectSource('paste');
    $('#paste-text').value = req.text;
    await analyze({ text: req.text, url: req.url, title: req.title, actionType: 'manual' }, t('analysingSelection'));
    return;
  }
  if (req.kind === 'url' && req.url) {
    selectSource('url');
    $('#url-input').value = req.url;
    $('#run-url').click();
    return;
  }
  if (req.kind === 'page') {
    selectSource('page');
    analyzeCurrentPage();
  }
}

// ── esempi, PDF nella versione web ──────────────────────────────────────────

function setupExtras() {
  // The examples under the box: first-time users almost never have a contract at hand.
  const lang = getLang();
  const ex = document.createElement('div');
  ex.className = 'examples';
  ex.innerHTML = `<span>${esc(t('tryExample2'))}</span>` + Object.entries(SAMPLES)
    .map(([k, v]) => `<button class="chip" data-sample="${k}" aria-pressed="false">${esc(v.label[{ en: 1, es: 2 }[lang] ?? 0])}</button>`).join('');
  $('#paste-text').after(ex);
  ex.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => runSample(b.dataset.sample)));
  // The shortcut next to the button: discoverable without reading instructions.
  $('#run-paste').title = /Mac/.test(navigator.platform) ? '⌘ + Invio' : 'Ctrl + Invio';

  if (isWeb) {
    // Pasting is the main action: the box is already open, the PDF is dropped or chosen from here.
    selectSource('paste');
    const pdf = document.createElement('p');
    pdf.className = 'pdf-hint muted small';
    pdf.innerHTML = `${esc(t('gotPdfDropHere'))} <button class="link" id="pick-pdf-2">${esc(t('chooseFromComputer'))}</button>`;
    $('#run-paste').after(pdf);
    $('#pick-pdf-2').addEventListener('click', () => $('#pdf-file').click());
    // "Open with AnteFirma" from the system (web/boot.js): the PDF arrives here.
    window.__afOpenPdf = (file) => handlePdf(file);
    window.__afSample = runSample;
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-try-sample]');
  if (b) runSample(b.dataset.trySample);
});

// ── avvio ───────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const settings = await send('GET_SETTINGS');
    setLang(resolveLang(settings.uiLang, chrome.i18n.getUILanguage()));
    translateDom(document.body);
    engineNote(settings);
  } catch { /* the panel stays usable anyway */ }
  commitments.init(send, { isWeb });
  setupExtras();
  send('GET_LICENSE').then((l) => paintQuota(l?.quota)).catch(() => {});

  // Opened from a deadline notification: go straight to the right commitment.
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'commitments') {
    selectTab('commitments');
    await commitments.load({ focusId: params.get('id') });
    // From the "Write the letter" reminder: the letter opens right away.
    if (params.get('letter') === '1' && params.get('id')) commitments.showLetter(params.get('id')).catch(() => {});
  }

  const pending = await send('GET_PENDING_PANEL_REQUEST').catch(() => null);
  if (pending) handlePanelRequest(pending);
})();

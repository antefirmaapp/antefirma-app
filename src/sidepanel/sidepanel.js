/**
 * Pannello laterale: le quattro vie d'ingresso all'analisi
 * (pagina, testo incollato, PDF, URL) e lo storico degli impegni.
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
/** La versione web (web.antefirma.app): stesso pannello, senza le funzioni che una pagina non può avere. */
const isWeb = document.documentElement.dataset.web === '1';

// ── infrastruttura ──────────────────────────────────────────────────────────

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res) throw new Error(t('Nessuna risposta dal motore.'));
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
  // Un esempio non è un contratto tuo: si guarda, non si registra.
  const trackable = !verdict.example && (verdict.cost?.horizonMonths || verdict.cost?.hasAutoRenewal || verdict.cost?.worstCase != null);
  if (verdict.engine?.quota) paintQuota(verdict.engine.quota);
  $('#result').innerHTML =
    (verdict.example ? `<div class="status example-note">${esc(t('Esempio: contratto inventato, nessuna analisi usata. Incolla il tuo testo per un’analisi vera.'))}</div>` : '') +
    renderVerdict(verdict) +
    (trackable
      ? `<button class="primary" id="track" style="margin-top:10px;width:100%">${esc(t('Registra come impegno e ricordamelo'))}</button>`
      : '');
  if (trackable) $('#track').addEventListener('click', trackCurrent);
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Anche un'analisi manuale può diventare una scadenza da presidiare: è il caso
 * del contratto che ti arriva via email e che firmi altrove.
 */
async function trackCurrent() {
  const btn = $('#track');
  btn.disabled = true;
  try {
    // Il testo lo ritrova il service worker dal verdetto in sessione: quello
    // della textarea è il testo di *una* delle quattro sorgenti, non di quella
    // che ha prodotto questo verdetto.
    const saved = await send('SAVE_COMMITMENT_FROM_VERDICT', {
      historyId: lastVerdict?.historyId,
      verdict: lastVerdict,
      decision: 'manual',
    });
    if (!saved) {
      status(t('Da questo testo non emerge una scadenza da presidiare.'), 'error');
      btn.disabled = false;
      return;
    }
    btn.textContent = t('Registrato negli impegni ✓');
    offerCalendar(saved);
    await commitments.load();
  } catch (err) {
    status(err.message, 'error');
    btn.disabled = false;
  }
}

/**
 * Subito dopo il salvataggio, la scadenza in calendario: è l'unico promemoria
 * che arriva anche a browser chiuso. Google Calendar o un file .ics.
 */
function offerCalendar(c) {
  if (!c?.deadlineAt || $('#cal-offer')) return;
  const day = new Date(c.deadlineAt);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const next = new Date(day.getTime() + 86400000);
  const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE',
    text: t('Disdetta {x}: ultimo giorno', { x: c.provider || c.host || '' }).trim(),
    dates: `${ymd(day)}/${ymd(next)}`,
    details: t('Ultimo giorno per inviare la disdetta. Promemoria creato con AnteFirma.'),
  }).toString();
  const box = document.createElement('div');
  box.id = 'cal-offer';
  box.className = 'cal-offer';
  box.innerHTML = `<p>${esc(t('Mettila anche in calendario: ti avvisa anche quando AnteFirma è chiusa.'))}</p>
    <div class="row"><a class="secondary btn-like" href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a>
    <button class="secondary" id="cal-ics">${esc(t('Apple, Outlook e altri (.ics)'))}</button></div>`;
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

/** Le analisi rimaste, in testata: si vede prima di finirle, non dopo. */
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
  el.textContent = t('{n} di {m} analisi rimaste questo mese', { n: m.remaining, m: m.limit });
  el.dataset.limit = m.limit;
  el.classList.toggle('low', m.remaining <= 1);
}

/** In fondo: le tutele scelte, in parole e cliccabili, e se manca ancora il consenso. */
function engineNote(settings) {
  const code = settings.jurisdiction || 'IT';
  let country = code;
  try { country = new Intl.DisplayNames([getLang()], { type: 'region' }).of(code === 'UK' ? 'GB' : code) || code; } catch { /* resta il codice */ }
  const el = $('#engine-note');
  el.innerHTML = `<button class="link" id="note-country" title="${esc(t('Cambia nelle impostazioni'))}">${esc(t('Tutele: {x}', { x: country }))}</button>` +
    (settings.remoteConsentAt ? '' : ' · ' + esc(t('alla prima analisi ti chiederò il consenso')));
  $('#note-country').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#tutele') }));
}

/** Un esempio pronto: stesso calcolo, nessun testo inviato, nessuna analisi consumata. */
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
  status(t('Analizzo l’esempio…'));
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
 * Il consenso alla prima analisi, chiesto dal pannello. Il testo parte verso il
 * server di AnteFirma solo dopo un sì.
 */
function askConsent() {
  return new Promise((resolve) => {
    commitments.openModal(
      t('Posso leggere questo testo per te?'),
      `<p>${esc(t('Per dirti a che cosa ti stai impegnando, AnteFirma manda il testo della pagina e il suo indirizzo al proprio server, che lo fa leggere a un modello di intelligenza artificiale (Claude, di Anthropic) e ti risponde con le clausole che ti impegnano, ciascuna con la frase esatta da cui nasce.'))}</p>
       <p>${esc(t('Il server non conserva il testo né l’indirizzo. Nessun account, nessun dato che ti identifichi. Puoi ritirare il consenso quando vuoi dalle impostazioni.'))}</p>`,
      [
        { label: t('Non ora'), act: () => { commitments.closeModal(); resolve(false); } },
        {
          label: t('Sì, analizza'),
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
    // «Chiudi», aggiunto dalla finestra stessa, vale come un no.
    document.querySelector('#modal-foot button:last-child')?.addEventListener('click', () => resolve(false), { once: true });
  });
}

async function analyze(payload, label) {
  if (state.busy) return;
  state.busy = true;
  status(label || t('Analisi in corso…'));
  $('#result').innerHTML = '';
  try {
    let verdict = await send('ANALYZE_TEXT', payload);
    if (verdict?.needsConsent) {
      status(null);
      if (!(await askConsent())) {
        status(t('Senza il tuo consenso il testo non viene inviato e l’analisi non parte.'), 'error');
        return;
      }
      status(label || t('Analisi in corso…'));
      verdict = await send('ANALYZE_TEXT', payload);
    }
    status(null);
    showResult(verdict);
  } catch (err) {
    if (err.code === 'quota_month') quotaOut(); else status(err.message || t('Analisi non riuscita.'), 'error');
  } finally {
    state.busy = false;
  }
}

/** Analisi del mese finite: non è un errore. Quando ripartono e che cosa si può fare intanto. */
function quotaOut() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const el = $('#status');
  el.hidden = false;
  el.className = 'status quota-out';
  el.innerHTML = `<b>${esc(t('Le analisi gratuite di questo mese sono finite.'))}</b>
    <span>${esc(t('Ripartono il {d}. Gli esempi intanto sono sempre disponibili.', { d: next.toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) }))}</span>
    <span class="row"><button class="secondary" id="qo-sample">${esc(t('Prova un esempio'))}</button>
    <button class="primary" id="qo-plans">${esc(t('Vedi i piani'))}</button></span>`;
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
    status(t('Questa pagina non può essere analizzata (non è una pagina web).'), 'error');
    return;
  }
  status(t('Leggo la pagina…'));
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const text = document.body?.innerText || '';
        const CF = globalThis.__CF;
        // Se il content script è presente, riusa il suo estrattore di prezzi.
        const pricing = CF?.context ? CF.context.extractPricing(document.body) : {};
        return { text: text.slice(0, 120000), pricing, title: document.title, url: location.href };
      },
    });
    if (!result?.text || result.text.trim().length < 60) {
      status(t('Non ho trovato testo sufficiente in questa pagina.'), 'error');
      return;
    }
    await analyze(
      { text: result.text, url: result.url, title: result.title, pricing: result.pricing, actionType: 'manual' },
      t('Analizzo la pagina…')
    );
  } catch (err) {
    status(t('Non riesco a leggere la pagina: {x}', { x: err.message }), 'error');
  }
}

// ── 2. testo incollato ──────────────────────────────────────────────────────

$('#run-paste').addEventListener('click', () => {
  const text = $('#paste-text').value.trim();
  if (text.length < 40) {
    status(t('Serve un testo un po’ più lungo per dire qualcosa di sensato.'), 'error');
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
    t('Analizzo il testo…')
  );
});

// Dalla casella del testo, Ctrl+Invio (⌘+Invio sul Mac) analizza.
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

// Trascinare il PDF ovunque nel pannello funziona comunque.
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
    status(t('Il file non è un PDF.'), 'error');
    return;
  }
  status(`Leggo ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const { text, pages, reliable, note } = await extractPdfText(buffer);
    if (!text || text.length < 60) {
      status(note || t('Non sono riuscito a estrarre testo da questo PDF.'), 'error');
      return;
    }
    if (!reliable && note) status(note, 'error');
    await analyze(
      { text, title: file.name, actionType: 'sign', ctx: { source: 'pdf', pages } },
      `Analizzo ${file.name} (${pages} pagine)…`
    );
  } catch (err) {
    status(err.message || t('Lettura del PDF non riuscita.'), 'error');
  }
}

// ── 4. URL ──────────────────────────────────────────────────────────────────

$('#run-url').addEventListener('click', async () => {
  const url = $('#url-input').value.trim();
  if (!url) return;
  status(t('Scarico il documento…'));
  try {
    const doc = await send('FETCH_DOCUMENT', { url });
    if (doc.isPdf) {
      status(t('È un PDF: scaricalo e trascinalo qui, così lo leggo senza inviarlo altrove.'), 'error');
      return;
    }
    if (!doc.text || doc.text.length < 60) {
      status(t('Il documento non contiene testo analizzabile.'), 'error');
      return;
    }
    await analyze({ text: doc.text, url: doc.url, title: url, actionType: 'manual' }, t('Analizzo il documento…'));
  } catch (err) {
    status(err.message, 'error');
  }
});

// ── schede e storico ────────────────────────────────────────────────────────

const TABS = [...document.querySelectorAll('.tab')];

/**
 * La classe `.active` è per gli occhi; `aria-selected` è l'unica cosa che uno
 * screen reader legge. Il `tabindex` a rotazione serve al resto del pattern:
 * dentro la barra ci si muove con le frecce, non con Tab, che deve saltare
 * direttamente al contenuto della scheda aperta.
 */
/** Il «?» porta alla guida della scheda aperta. */
const HELP_OF_TAB = { analyze: 'analizzare', commitments: 'impegni', history: 'problemi' };
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
      ? `<div class="empty">${esc(t('Le analisi che fai compaiono qui, con le scadenze da ricordare.'))}<p class="muted small"><button class="link" data-try-sample="gym">${esc(t('Prova con un esempio'))}</button></p></div>`
      : `<div class="empty">${esc(t('Nessun impegno registrato.'))}<br>${esc(t('Lo storico si riempie quando il firewall interviene su un pulsante di accettazione, acquisto o firma.'))}<p class="muted small"><a href="https://antefirma.app/demo/" target="_blank" rel="noopener">${esc(t('Provalo su una pagina dimostrativa'))}</a></p></div>`;
    return;
  }

  const now = Date.now();
  el.innerHTML = groupHistory(list)
    .map(({ h, count }) => {
      const when = new Date(h.at);
      const deadline = h.deadline ? new Date(h.deadline) : null;
      const daysLeft = deadline ? Math.round((deadline - now) / 86400000) : null;
      // `data-level` non è decorazione: in tema scuro sidepanel.css se ne serve
      // per sostituire il colore chiaro con una variante leggibile sul fondo.
      return `<div class="h-item" data-level="${esc(h.level || '')}" style="--level-color:${LEVEL_COLORS[h.level] || '#888'}">
        <div class="h-top">
          <span>${esc(h.host || '—')}</span>
          <span>${when.toLocaleDateString(locale())}</span>
        </div>
        <div class="h-title">${esc(h.headline || '')}</div>
        ${h.worstCase ? `<div class="h-cost">${esc(t('Impegno stimato: {x}.', { x: formatMoney(h.worstCase, h.currency || 'EUR') }))}</div>` : ''}
        ${deadline && daysLeft != null ? `<div class="h-deadline">⏰ ${esc(t('Disdetta entro il {d}', { d: deadline.toLocaleDateString(locale()) }))}${esc(daysLeft >= 0 ? ' — ' + t('fra {n} giorni', { n: daysLeft }) : ' — ' + t('scaduta'))}</div>` : ''}
        ${h.mustRemember && !deadline ? `<div class="h-deadline">📌 ${esc(h.mustRemember)}</div>` : ''}
        <div class="h-decision">${esc(decisionLabel(h))}${count > 1 ? ` · <span class="h-count">${esc(t('{n} volte', { n: count }))}</span>` : ''}</div>
      </div>`;
    })
    .join('');
}

/**
 * Lo stesso avviso sullo stesso sito, lo stesso giorno e con la stessa decisione
 * (chi riprova un acquisto, chi ricarica la pagina) diventa una scheda sola: «5 volte».
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

/** Che cosa è successo davvero, non solo se l'utente ha proseguito. */
function decisionLabel(h) {
  if (h.decision === 'cancel') return t('Ti sei fermato');
  if (h.decision !== 'proceed') return t('Nessuna decisione registrata');
  if (h.via === 'auto') return t('Proseguito senza blocco');
  if (h.via === 'allowlist') return t('Proseguito, sito escluso dagli avvisi');
  return t('Hai proseguito');
}

$('#clear-history').addEventListener('click', async () => {
  await send('CLEAR_HISTORY');
  loadHistory();
});

$('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ── richieste in arrivo dal menu contestuale ────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'PANEL_REQUEST') handlePanelRequest(msg.payload);
});

async function handlePanelRequest(req) {
  if (!req) return;
  if (req.kind === 'selection' && req.text) {
    selectSource('paste');
    $('#paste-text').value = req.text;
    await analyze({ text: req.text, url: req.url, title: req.title, actionType: 'manual' }, t('Analizzo la selezione…'));
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
  // Gli esempi sotto la casella: chi apre per la prima volta quasi mai ha un contratto sotto mano.
  const lang = getLang();
  const ex = document.createElement('div');
  ex.className = 'examples';
  ex.innerHTML = `<span>${esc(t('Prova con un esempio:'))}</span>` + Object.entries(SAMPLES)
    .map(([k, v]) => `<button class="chip" data-sample="${k}" aria-pressed="false">${esc(v.label[{ en: 1, es: 2 }[lang] ?? 0])}</button>`).join('');
  $('#paste-text').after(ex);
  ex.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => runSample(b.dataset.sample)));
  // Il tasto vicino al pulsante: si scopre senza leggere istruzioni.
  $('#run-paste').title = /Mac/.test(navigator.platform) ? '⌘ + Invio' : 'Ctrl + Invio';

  if (isWeb) {
    // Incollare è l'azione principale: la casella è già aperta, il PDF si trascina o si sceglie da qui.
    selectSource('paste');
    const pdf = document.createElement('p');
    pdf.className = 'pdf-hint muted small';
    pdf.innerHTML = `${esc(t('Hai un PDF? Trascinalo qui oppure'))} <button class="link" id="pick-pdf-2">${esc(t('sceglilo dal computer'))}</button>`;
    $('#run-paste').after(pdf);
    $('#pick-pdf-2').addEventListener('click', () => $('#pdf-file').click());
    // «Apri con AnteFirma» dal sistema (web/boot.js): il PDF arriva qui.
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
  } catch { /* il pannello resta usabile comunque */ }
  commitments.init(send, { isWeb });
  setupExtras();
  send('GET_LICENSE').then((l) => paintQuota(l?.quota)).catch(() => {});

  // Aperto da una notifica di scadenza: si va dritti all'impegno giusto.
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'commitments') {
    selectTab('commitments');
    await commitments.load({ focusId: params.get('id') });
    // Dal promemoria «Scrivi la lettera»: si apre già la lettera.
    if (params.get('letter') === '1' && params.get('id')) commitments.showLetter(params.get('id')).catch(() => {});
  }

  const pending = await send('GET_PENDING_PANEL_REQUEST').catch(() => null);
  if (pending) handlePanelRequest(pending);
})();

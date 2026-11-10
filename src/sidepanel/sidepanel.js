/**
 * Pannello laterale: le quattro vie d'ingresso all'analisi
 * (pagina, testo incollato, PDF, URL) e lo storico degli impegni.
 */

import { renderVerdict, esc } from './render.js';
import * as commitments from './commitments-ui.js';
import { extractPdfText } from '../lib/pdf-text.js';
import { formatMoney } from '../core/text.js';
import { t, setLang, resolveLang, locale } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';

const $ = (sel) => document.querySelector(sel);
const state = { source: null, busy: false };

// ── infrastruttura ──────────────────────────────────────────────────────────

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res) throw new Error(t('Nessuna risposta dal motore.'));
  if (!res.ok) throw new Error(res.error);
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
  const trackable = verdict.cost?.horizonMonths || verdict.cost?.hasAutoRenewal || verdict.cost?.worstCase != null;
  $('#result').innerHTML =
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
    await commitments.load();
  } catch (err) {
    status(err.message, 'error');
    btn.disabled = false;
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
    status(err.message || t('Analisi non riuscita.'), 'error');
  } finally {
    state.busy = false;
  }
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
    selectSource('pdf');
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
function selectTab(name, { focus = false } = {}) {
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
    el.innerHTML = `<div class="empty">${esc(t('Nessun impegno registrato.'))}<br>${esc(t('Lo storico si riempie quando il firewall interviene su un pulsante di accettazione, acquisto o firma.'))}<p class="muted small"><a href="https://antefirma.app/demo/" target="_blank" rel="noopener">${esc(t('Provalo su una pagina dimostrativa'))}</a></p></div>`;
    return;
  }

  const now = Date.now();
  el.innerHTML = list
    .map((h) => {
      const when = new Date(h.at);
      const deadline = h.deadline ? new Date(h.deadline) : null;
      const daysLeft = deadline ? Math.round((deadline - now) / 86400000) : null;
      // `data-level` non è decorazione: in tema scuro sidepanel.css se ne serve
      // per sostituire il colore chiaro con una variante leggibile sul fondo.
      return `<div class="h-item" data-level="${esc(h.level || '')}" style="--level-color:${LEVEL_COLORS[h.level] || '#888'}">
        <div class="h-top">
          <span>${esc(h.host || '—')}</span>
          <span>${when.toLocaleDateString(locale())} · ${esc(String(h.score))}/100</span>
        </div>
        <div class="h-title">${esc(h.headline || '')}</div>
        ${h.worstCase ? `<div class="h-cost">${esc(t('Impegno stimato: {x}.', { x: formatMoney(h.worstCase, h.currency || 'EUR') }))}</div>` : ''}
        ${deadline && daysLeft != null ? `<div class="h-deadline">⏰ ${esc(t('Disdetta entro il {d}', { d: deadline.toLocaleDateString(locale()) }))}${esc(daysLeft >= 0 ? ' — ' + t('fra {n} giorni', { n: daysLeft }) : ' — ' + t('scaduta'))}</div>` : ''}
        ${h.mustRemember && !deadline ? `<div class="h-deadline">📌 ${esc(h.mustRemember)}</div>` : ''}
        <div class="h-decision">${esc(decisionLabel(h))}</div>
      </div>`;
    })
    .join('');
}

/** Che cosa è successo davvero, non solo se l'utente ha proseguito. */
function decisionLabel(h) {
  if (h.decision === 'cancel') return t('Ti sei fermato');
  if (h.decision !== 'proceed') return t('Nessuna decisione registrata');
  if (h.via === 'auto') return t('Proseguito senza blocco');
  if (h.via === 'allowlist') return t('Proseguito, sito escluso dagli avvisi');
  return 'Hai proseguito';
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

// ── avvio ───────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const settings = await send('GET_SETTINGS');
    setLang(resolveLang(settings.uiLang, chrome.i18n.getUILanguage()));
    translateDom(document.body);
    $('#engine-note').textContent =
      t('Analisi: server di AnteFirma · giurisdizione {x}', { x: settings.jurisdiction }) +
      (settings.remoteConsentAt ? '' : ' · ' + t('alla prima analisi ti chiederò il consenso'));
  } catch { /* il pannello resta usabile comunque */ }
  commitments.init(send);

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

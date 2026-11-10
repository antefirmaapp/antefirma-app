/**
 * Il kit di uscita, lato interfaccia.
 *
 * Ogni impegno registrato porta con sé quattro azioni, che sono le quattro
 * cose che servono davvero quando arriva il momento:
 *   · la scadenza nel calendario, perché l'estensione non può ricordartelo
 *     se Chrome è chiuso;
 *   · la lettera già scritta, perché il costo vero della disdetta è scriverla;
 *   · la prova di cosa avevi accettato;
 *   · il confronto con le condizioni di oggi.
 *
 * Due di queste quattro sono in prima fila; le altre stanno nel menu «⋯»,
 * insieme all'unica azione che distrugge qualcosa. Sei pulsanti identici
 * larghi 11,5 px in una colonna da 350 px non sono una scelta: sono un invito
 * a premere quello sbagliato.
 */

import { esc } from './render.js';
import { formatMoney } from '../core/text.js';
import { commitmentState, costOfDoingNothing, portfolioSummary, formatDate } from '../core/commitments.js';
import { LETTER_LABELS } from '../core/letter.js';
import { t, tn, locale } from '../i18n/index.js';

const $ = (sel) => document.querySelector(sel);

let send = async () => { throw new Error('bridge non inizializzato'); };
let cache = [];

/** Ricerca e filtri sopravvivono al re-render: sono lo sguardo dell'utente. */
const view = { query: '', filter: 'all' };

/** L'eliminazione in attesa di conferma silenziosa: vedi `startDelete`. */
let pending = null;

/** Oltre questa soglia setacciare a occhio non funziona più. */
const SEARCH_THRESHOLD = 8;

// ── ordinamento e raggruppamento ────────────────────────────────────────────

/**
 * Lo storage impila con `unshift`: l'ordine naturale della lista è quello di
 * registrazione, dal più recente. È l'ordine sbagliato — l'unica cosa che
 * conta qui è quanto manca alla scadenza. Con venti impegni, quello da
 * disdire fra tre giorni finiva in fondo.
 */
const GROUPS = [
  { id: 'week', label: 'Entro 7 giorni' },
  { id: 'month', label: 'Entro 30 giorni' },
  { id: 'later', label: 'Più avanti' },
  { id: 'passed', label: 'Finestra scaduta' },
  { id: 'closed', label: 'Disdetti' },
];

function groupOf(c, state) {
  if (c.status !== 'active') return 'closed';
  if (state.daysLeft == null) return 'later';
  if (state.daysLeft < 0) return 'passed';
  if (state.daysLeft <= 7) return 'week';
  if (state.daysLeft <= 30) return 'month';
  return 'later';
}

const CHIP_LABELS = {
  all: 'Tutti',
  urgent: 'Entro 30 giorni',
  active: 'Attivi',
  cancelled: 'Disdetti',
};

function matchesFilter(c, filter) {
  if (filter === 'all') return true;
  if (filter === 'active') return c.status === 'active';
  if (filter === 'cancelled') return c.status !== 'active';
  if (filter === 'urgent') {
    if (c.status !== 'active') return false;
    const { daysLeft } = commitmentState(c);
    return daysLeft != null && daysLeft >= 0 && daysLeft <= 30;
  }
  return true;
}

function matchesQuery(c, query) {
  if (!query) return true;
  const haystack = [c.provider, c.host, c.headline].filter(Boolean).join(' ').toLowerCase();
  // Ogni parola deve comparire: chi scrive due termini sta restringendo.
  return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

// ── avvio ───────────────────────────────────────────────────────────────────

let isWeb = false;
export function init(sender, opts = {}) {
  send = sender;
  isWeb = Boolean(opts.isWeb);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });
  $('#commitments-list').addEventListener('click', onAction);

  $('#c-search').addEventListener('input', (e) => {
    view.query = e.target.value.trim().toLowerCase();
    render(cache);
  });
  $('#c-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    view.filter = chip.dataset.filter;
    render(cache);
  });

  // Un menu aperto che resta aperto mentre si clicca altrove è un menu che
  // finisce sopra la card sbagliata: in cattura, così vale anche per i click
  // che vengono fermati più in basso.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.c-menu-wrap')) closeMenus();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) { closeModal(); return; }
    closeMenus();
  });
}

export async function load({ focusId = null } = {}) {
  cache = await send('GET_COMMITMENTS');
  render(cache);
  if (focusId) {
    const el = document.querySelector(`[data-commitment="${CSS.escape(focusId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('focus');
  }
}

// ── rendering ───────────────────────────────────────────────────────────────

function render(list) {
  const summary = portfolioSummary(list);
  $('#portfolio').innerHTML = list.length ? renderPortfolio(summary) : '';

  // La riga in attesa di eliminazione sparisce subito dalla vista, ma dallo
  // storage non è ancora uscita: è quello che rende annullabile il gesto.
  const alive = list.filter((c) => c.id !== pending?.id);

  $('#c-tools').hidden = alive.length <= SEARCH_THRESHOLD;
  if ($('#c-tools').hidden) {
    // Nascondere i filtri lasciandoli attivi renderebbe invisibile metà lista.
    view.query = '';
    view.filter = 'all';
    $('#c-search').value = '';
  }
  paintChips(alive);

  if (!list.length) {
    // Lo stato vuoto mostra come apparirà un impegno, con la strada per provarlo.
    $('#commitments-list').innerHTML = `<div class="empty">
      <p>${esc(isWeb
        ? t('Quando registri un impegno dopo un’analisi, la scadenza di disdetta finisce qui, con la lettera già pronta.')
        : t('Quando prosegui su un contratto o un abbonamento, la scadenza di disdetta finisce qui, con la lettera già pronta e la prova di cosa avevi accettato.'))}</p>
      <div class="c-item example" aria-hidden="true">
        <div class="c-top"><span class="c-name">StreamPro</span><span class="c-amount">599,76 €</span></div>
        <span class="c-state" data-urgency="later">${esc(t('Disdetta entro il {d}', { d: '9/9/2028' }))}</span>
        <div class="c-nothing">${esc(t('Se non disdici, parte un nuovo periodo da {x}.', { x: '479,76 €' }))}</div>
      </div>
      <p class="muted small">${esc(t('Esempio'))} · ${isWeb
        ? `<button class="link" data-try-sample="streaming">${esc(t('Prova con un esempio'))}</button>`
        : `<a href="https://antefirma.app/demo/" target="_blank" rel="noopener">${esc(t('Provalo su una pagina dimostrativa'))}</a>`}</p>
    </div>`;
    return;
  }

  const shown = alive
    .filter((c) => matchesFilter(c, view.filter) && matchesQuery(c, view.query))
    .map((c) => ({ c, state: commitmentState(c) }));

  if (!shown.length) {
    $('#commitments-list').innerHTML = `<div class="empty">
      ${esc(t('Nessun impegno corrisponde a questa ricerca.'))}<br>
      <button class="link" data-act="reset-view">${esc(t('Mostra tutti gli impegni'))}</button>
    </div>`;
    return;
  }

  const buckets = new Map(GROUPS.map((g) => [g.id, []]));
  for (const item of shown) buckets.get(groupOf(item.c, item.state)).push(item);

  const html = GROUPS.map((g) => {
    const items = buckets.get(g.id);
    if (!items.length) return '';
    // Dentro il gruppo si va dal più imminente al più lontano; fra le finestre
    // già chiuse invece conta l'opposto, la più fresca è quella su cui si può
    // ancora tentare qualcosa.
    items.sort((a, b) =>
      g.id === 'passed'
        ? (b.state.daysLeft ?? -Infinity) - (a.state.daysLeft ?? -Infinity)
        : (a.state.daysLeft ?? Infinity) - (b.state.daysLeft ?? Infinity)
    );
    return `<h3 class="c-group" data-group="${g.id}">${esc(t(g.label))}<span>${items.length}</span></h3>
      ${items.map(({ c, state }) => renderItem(c, state)).join('')}`;
  }).join('');

  $('#commitments-list').innerHTML = html;
}

function paintChips(list) {
  for (const chip of $('#c-filters').querySelectorAll('.chip')) {
    const f = chip.dataset.filter;
    const on = f === view.filter;
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', String(on));
    chip.textContent = `${t(CHIP_LABELS[f])} · ${list.filter((c) => matchesFilter(c, f)).length}`;
  }
}

function renderPortfolio(s) {
  const totals = s.totals.map((t) => formatMoney(t.amount, t.currency)).join(' · ') || '—';
  return `
    <div class="big">${esc(totals)}</div>
    <div class="cap">${esc(tn(s.count, 'esposizione complessiva su {n} impegno attivo', 'esposizione complessiva su {n} impegni attivi'))}</div>
    ${s.next ? `<div class="next">${esc(t('Prossima scadenza:'))} <strong>${esc(s.next.c.provider || s.next.c.host || '')}</strong> — ${esc(s.next.state.label.toLowerCase())}</div>` : ''}
  `;
}

function renderItem(c, state = commitmentState(c)) {
  const doing = costOfDoingNothing(c);
  const lastChange = (c.changes || []).slice(-1)[0];
  const id = esc(c.id);

  return `
    <div class="c-item" data-commitment="${id}">
      <div class="c-top">
        <span class="c-name">${esc(c.provider || c.host || t('Impegno'))}</span>
        <span class="c-amount">${c.worstCase != null ? esc(formatMoney(c.worstCase, c.currency)) : ''}</span>
      </div>
      ${c.headline ? `<div class="c-head">${esc(c.headline)}</div>` : ''}
      <span class="c-state" data-urgency="${esc(state.urgency)}">${esc(state.label)}</span>
      ${doing && state.urgency !== 'done' ? `<div class="c-nothing">${esc(doing.label)}</div>` : ''}
      ${c.renewalAt ? `<div class="c-nothing">${esc(t('Scadenza del periodo: {d}.', { d: formatDate(new Date(c.renewalAt)) }).replace(/\.$/, ''))}${c.noticeMonths ? ` · ${esc(t('preavviso {n} giorni', { n: Math.round(c.noticeMonths * 30) }))}` : ''}</div>` : ''}
      ${lastChange && lastChange.changed ? `<div class="c-change">⚠️ ${esc(lastChange.summary)}</div>` : ''}
      ${lastChange && !lastChange.changed ? `<div class="c-nothing">✓ ${esc(t('Verificato il {d}: condizioni invariate.', { d: new Date(lastChange.checkedAt).toLocaleDateString(locale()) }))}</div>` : ''}
      ${state.urgency !== 'done' && c.deadlineAt && !c.inCalendar
        ? `<div class="c-hint">${esc(t('I promemoria funzionano solo con il browser aperto: metti la scadenza anche in calendario.'))}</div>`
        : ''}
      <div class="c-actions">
        <button class="strong" data-act="ics" data-id="${id}">${esc(t('Calendario'))}</button>
        <button data-act="letter" data-id="${id}">${esc(t('Lettera'))}</button>
        <div class="c-menu-wrap">
          <button class="c-more" data-act="menu" data-id="${id}"
                  aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('Altre azioni'))}">⋯</button>
          <div class="c-menu" data-menu="${id}" hidden>${renderMenu(c)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderMenu(c) {
  const id = esc(c.id);
  return `
    <button data-act="check" data-id="${id}">${esc(t('Verifica modifiche'))}</button>
    <button data-act="proof" data-id="${id}">${esc(t('Prova di cosa hai accettato'))}</button>
    <button data-act="export" data-id="${id}">${esc(t('Esporta l’archivio'))}</button>
    ${c.status === 'active'
      ? `<button data-act="cancelled" data-id="${id}">${esc(t('Segna come disdetto'))}</button>`
      : `<button data-act="reactivate" data-id="${id}">${esc(t('Riattiva'))}</button>`}
    <button class="danger" data-act="delete-ask" data-id="${id}">${esc(t('Elimina definitivamente…'))}</button>
  `;
}

/**
 * Il secondo passo dell'eliminazione. Non è una formalità: qui sparisce lo
 * snapshot integrale, l'impronta SHA-256 che lo rende opponibile e il piano
 * delle scadenze. Va detto per intero, e va offerta la via d'uscita — portarsi
 * via l'archivio prima di bruciarlo.
 */
function renderConfirm(c) {
  const id = esc(c.id);
  return `
    <p class="c-confirm-text">
      ${esc(t('Elimini {x}?', { x: c.provider || c.host || t('questo impegno') }))}
      ${esc(t('Sparisce anche la prova: il testo conservato, l’impronta SHA-256 che lo certifica e le scadenze. Non si recupera.'))}
    </p>
    <button data-act="export" data-id="${id}">${esc(t('Esporta prima di eliminare'))}</button>
    <button class="danger" data-act="delete-confirm" data-id="${id}">${esc(t('Sì, elimina'))}</button>
    <button class="link" data-act="menu-close" data-id="${id}">${esc(t('Annulla'))}</button>
  `;
}

// ── menu ────────────────────────────────────────────────────────────────────

function closeMenus() {
  for (const menu of document.querySelectorAll('.c-menu')) {
    if (menu.hidden) continue;
    menu.hidden = true;
    // Il secondo passo non sopravvive alla chiusura: riaprire il menu deve
    // ripartire dal menu, non dalla conferma di eliminazione già armata.
    const c = cache.find((x) => x.id === menu.dataset.menu);
    if (c) menu.innerHTML = renderMenu(c);
    menu.closest('.c-menu-wrap')?.querySelector('.c-more')?.setAttribute('aria-expanded', 'false');
  }
}

function toggleMenu(id) {
  const menu = document.querySelector(`.c-menu[data-menu="${CSS.escape(id)}"]`);
  if (!menu) return;
  const wasOpen = !menu.hidden;
  closeMenus();
  if (wasOpen) return;
  menu.hidden = false;
  menu.closest('.c-menu-wrap')?.querySelector('.c-more')?.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
}

// ── azioni ──────────────────────────────────────────────────────────────────

/** Azioni che non parlano con il service worker: nessuna attesa da mostrare. */
const INSTANT = new Set(['menu', 'menu-close', 'delete-ask', 'delete-confirm', 'reset-view']);

async function onAction(event) {
  const btn = event.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;

  if (INSTANT.has(act)) {
    if (act === 'menu') toggleMenu(id);
    if (act === 'menu-close') closeMenus();
    if (act === 'delete-ask') {
      const c = cache.find((x) => x.id === id);
      const menu = document.querySelector(`.c-menu[data-menu="${CSS.escape(id)}"]`);
      if (c && menu) {
        menu.innerHTML = renderConfirm(c);
        menu.classList.add('confirming');
        menu.querySelector('.danger')?.focus();
      }
    }
    if (act === 'delete-confirm') startDelete(id);
    if (act === 'reset-view') {
      view.query = '';
      view.filter = 'all';
      $('#c-search').value = '';
      render(cache);
    }
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';

  try {
    if (act === 'letter') await showLetter(id);
    if (act === 'ics') await downloadIcs(id);
    if (act === 'check') await showChanges(id);
    if (act === 'proof') await showProof(id);
    if (act === 'export') await exportArchive(id);
    if (act === 'cancelled') {
      await send('UPDATE_COMMITMENT', { id, patch: { status: 'cancelled' } });
      await load();
    }
    if (act === 'reactivate') {
      await send('UPDATE_COMMITMENT', { id, patch: { status: 'active' } });
      await load();
    }
  } catch (err) {
    openModal(t('Non è stato possibile completare l’operazione'), `<div class="status error">${esc(err.message)}</div>`, []);
  } finally {
    // Dopo un `load()` il pulsante è staccato dal documento: innocuo.
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── eliminazione con finestra di ripensamento ───────────────────────────────

const UNDO_MS = 8000;

/**
 * `DELETE_COMMITMENT` è irreversibile e non esiste il messaggio inverso: la
 * sola forma onesta di «annulla» è **non eliminare ancora**. La card sparisce
 * subito, ma la cancellazione parte solo allo scadere della finestra. Se il
 * pannello viene chiuso prima, l'impegno resta: l'errore cade dalla parte
 * giusta.
 */
function startDelete(id) {
  const c = cache.find((x) => x.id === id);
  if (!c) return;
  closeMenus();
  if (pending) finalizeDelete();          // una eliminazione in sospeso per volta

  pending = { id, commitment: c, endsAt: Date.now() + UNDO_MS, timer: null, tick: null };
  pending.timer = setTimeout(finalizeDelete, UNDO_MS);
  pending.tick = setInterval(tickUndo, 500);
  render(cache);
  showUndoBar(c);
}

function showUndoBar(c) {
  const bar = $('#undo-bar');
  const name = c.provider || c.host || 'Impegno';
  // La barra si scrive una volta sola: riscrivere l'HTML a ogni secondo
  // toglierebbe il fuoco dal pulsante «Annulla» proprio a chi lo sta cercando
  // con la tastiera.
  bar.innerHTML = `<span>${esc(t('Eliminato «{x}» con la sua prova.', { x: name }))}</span>
    <button class="link" id="undo-delete">${esc(t('Annulla'))} (<span id="undo-count">${Math.ceil(UNDO_MS / 1000)}</span>)</button>`;
  bar.hidden = false;
  $('#undo-delete').addEventListener('click', undoDelete);
}

function tickUndo() {
  const el = document.getElementById('undo-count');
  if (!el || !pending) return;
  el.textContent = String(Math.max(1, Math.ceil((pending.endsAt - Date.now()) / 1000)));
}

function hideUndoBar() {
  const bar = $('#undo-bar');
  bar.hidden = true;
  bar.innerHTML = '';
}

function undoDelete() {
  if (!pending) return;
  clearTimeout(pending.timer);
  clearInterval(pending.tick);
  const { id } = pending;
  pending = null;
  hideUndoBar();
  render(cache);
  document.querySelector(`[data-commitment="${CSS.escape(id)}"]`)?.classList.add('focus');
}

async function finalizeDelete() {
  if (!pending) return;
  const { id } = pending;
  clearTimeout(pending.timer);
  clearInterval(pending.tick);
  pending = null;
  hideUndoBar();
  try {
    await send('DELETE_COMMITMENT', { id });
    await load();
  } catch (err) {
    openModal(t('Non è stato possibile eliminare l’impegno'), `<div class="status error">${esc(err.message)}</div>`, []);
    await load();
  }
}

// ── le quattro azioni ───────────────────────────────────────────────────────

export async function showLetter(id, kind = null, lang = null) {
  const letter = await send('BUILD_LETTER', { id, kind, lang });
  const langs = [['it', 'Italiano'], ['es', 'Español'], ['en', 'English']]
    .map(([k, label]) => `<option value="${k}" ${k === letter.lang ? 'selected' : ''}>${label}</option>`).join('');

  const options = Object.entries(LETTER_LABELS)
    .map(([k, label]) => `<option value="${k}" ${k === letter.kind ? 'selected' : ''}>${esc(t(label))}</option>`)
    .join('');

  openModal(
    t('Lettera pronta da inviare'),
    `
      <div class="letter-opts"><select id="letter-kind" aria-label="${esc(t('Tipo di lettera'))}">${options}</select>
      <select id="letter-lang" aria-label="${esc(t('Lingua della lettera'))}" title="${esc(t('La lingua del fornitore a cui la mandi'))}">${langs}</select></div>
      <ul class="checklist">${letter.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <pre id="letter-text">${esc(letter.text)}</pre>
    `,
    [
      { label: t('Copia'), act: (btn) => copy(letter.text, btn) },
      { label: t('Scarica .txt'), act: () => download(letter.filename, letter.text, 'text/plain') },
    ]
  );

  $('#letter-kind').addEventListener('change', (e) => showLetter(id, e.target.value, $('#letter-lang').value));
  $('#letter-lang').addEventListener('change', (e) => showLetter(id, $('#letter-kind').value, e.target.value));
}

async function downloadIcs(id) {
  const { content, filename } = await send('BUILD_ICS', { id });
  download(filename, content, 'text/calendar');
  // Una volta in calendario la scadenza non dipende più da noi: si smette di insistere.
  await send('UPDATE_COMMITMENT', { id, patch: { inCalendar: true } });
  await load();
}

async function showChanges(id) {
  const diff = await send('CHECK_CHANGES', { id });
  await load();

  const body = diff.changed
    ? `
      <p class="summary">${esc(diff.summary)}</p>
      ${diff.added.length ? `<p class="muted small"><strong>${esc(t('Condizioni comparse:'))}</strong> ${esc(diff.added.join(', '))}</p>` : ''}
      ${diff.removed.length ? `<p class="muted small"><strong>${esc(t('Condizioni sparite:'))}</strong> ${esc(diff.removed.join(', '))}</p>` : ''}
      ${diff.severity === 'major'
        ? `<p class="muted small">${esc(t('Una modifica unilaterale sfavorevole può aprire la strada al recesso senza penali: nella lettera trovi la variante apposita.'))}</p>`
        : ''}
    `
    : `<p class="summary">${esc(diff.summary)}</p>`;

  openModal(t('Confronto con le condizioni che avevi accettato'), body,
    diff.severity === 'major' ? [{ label: t('Lettera di recesso'), act: () => showLetter(id, LETTER_KINDS.CHANGE) }] : []);
}

async function showProof(id) {
  const proof = await send('GET_PROOF', { id });
  const when = proof.snapshot?.at ? new Date(proof.snapshot.at).toLocaleString(locale()) : '—';

  openModal(
    t('Prova di cosa hai accettato'),
    `
      ${proof.valid
        ? `<div class="proof-ok">✓ ${esc(t('Il testo conservato corrisponde all’impronta registrata.'))}</div>`
        : `<div class="proof-bad">⚠️ ${esc(t('Il testo conservato non corrisponde all’impronta: non usarlo come prova.'))}</div>`}
      <p class="muted small">${esc(t('Accettato il {d}', { d: when }))} · ${esc(t('{n} caratteri', { n: proof.snapshot?.chars ?? 0 }))}</p>
      <pre>${esc(proof.attestation)}</pre>
      <p class="muted small">${esc(t('Estratto:'))}</p>
      <pre>${esc((proof.snapshot?.excerpt || '').slice(0, 700))}…</pre>
    `,
    [
      { label: t('Scarica attestazione'), act: () => download(proof.filename, proof.attestation, 'text/plain') },
      {
        label: t('Scarica il testo integrale'),
        act: () => download(proof.filename.replace('prova-', 'testo-'), proof.text || '', 'text/plain'),
      },
    ]
  );
}

/**
 * Attestazione e testo integrale in un file solo: se stai per cancellare la
 * prova, scaricarla in due pezzi da due menu diversi è una richiesta che nessuno
 * soddisfa.
 */
async function exportArchive(id) {
  const proof = await send('GET_PROOF', { id });
  const c = cache.find((x) => x.id === id) || {};
  const state = commitmentState(c);
  const header = [
    `${t('Impegno:')} ${c.provider || c.host || '—'}`,
    c.headline ? `${t('Sintesi:')} ${c.headline}` : null,
    c.worstCase != null ? `${t('Impegno economico stimato:')} ${formatMoney(c.worstCase, c.currency || 'EUR')}` : null,
    c.deadlineAt ? `${t('Disdetta entro:')} ${formatDate(new Date(c.deadlineAt))}` : null,
    c.renewalAt ? `${t('Scadenza del periodo:')} ${formatDate(new Date(c.renewalAt))}` : null,
    `${t('Stato:')} ${state.label}`,
  ].filter(Boolean).join('\n');

  const body = [
    header,
    '',
    `── ${t('attestazione')} ──────────────────────────────`,
    proof.attestation || '',
    '',
    `── ${t('testo integrale conservato')} ──────────────────────────────`,
    proof.text || proof.snapshot?.excerpt || '',
  ].join('\n');

  download((proof.filename || `archivio-${id}.txt`).replace('prova-', 'archivio-'), body, 'text/plain');
}

// ── modale e download ───────────────────────────────────────────────────────

export function openModal(title, bodyHtml, actions = []) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-foot').innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = a.label;
    // L'azione riceve il proprio pulsante: è lì che deve comparire l'esito.
    btn.addEventListener('click', () => a.act(btn));
    $('#modal-foot').append(btn);
  }
  const close = document.createElement('button');
  close.className = 'link';
  close.textContent = t('Chiudi');
  close.addEventListener('click', closeModal);
  $('#modal-foot').append(close);
  $('#modal').hidden = false;
}

export function closeModal() {
  $('#modal').hidden = true;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Copiare negli appunti è un'operazione che può fallire in silenzio (permesso
 * negato, documento non a fuoco) e riuscire altrettanto in silenzio. In
 * entrambi i casi l'utente premeva «Copia» e non succedeva niente di visibile:
 * qui l'esito lo dice il pulsante stesso.
 */
async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    flash(btn, t('Copiato ✓'), 2000);
  } catch {
    flash(btn, t('Copia non riuscita: usa Scarica .txt'), 4000, 'failed');
  }
}

function flash(btn, message, ms, kind = 'ok') {
  if (!btn) return;
  if (btn.dataset.restore == null) btn.dataset.restore = btn.textContent;
  clearTimeout(Number(btn.dataset.timer));
  btn.textContent = message;
  btn.classList.toggle('flash-failed', kind === 'failed');
  btn.dataset.timer = String(setTimeout(() => {
    btn.textContent = btn.dataset.restore;
    btn.classList.remove('flash-failed');
    delete btn.dataset.restore;
    delete btn.dataset.timer;
  }, ms));
}

/**
 * The exit kit, interface side.
 *
 * Every recorded commitment carries four actions, the four things really needed
 * when the time comes:
 *   · the deadline in the calendar, because the extension can't remind you
 *     while Chrome is closed;
 *   · the letter already written, because the real cost of cancelling is writing it;
 *   · proof of what you had accepted;
 *   · the comparison with today's terms.
 *
 * Two of the four are up front; the others are in the "⋯" menu, together with
 * the only action that destroys something. Six identical 11.5 px buttons in a
 * 350 px column are not a choice: they are an invitation to press the wrong
 * one.
 */

import { esc } from './render.js';
import { formatMoney } from '../core/text.js';
import { commitmentState, costOfDoingNothing, portfolioSummary, formatDate } from '../core/commitments.js';
import { LETTER_LABELS, LETTER_KINDS, LETTER_LANGS } from '../core/letter.js';
import { nameOf } from '../core/languages.js';
import { t, tn, locale, getLang } from '../i18n/index.js';
import { helpUrl } from '../core/help.js';

const $ = (sel) => document.querySelector(sel);

let send = async () => { throw new Error('bridge not initialised'); };
let cache = [];

/** Search and filters survive re-rendering: they are the user's point of view. */
const view = { query: '', filter: 'all' };

/** The deletion waiting for silent confirmation: see `startDelete`. */
let pending = null;

/** Beyond this threshold sifting by eye no longer works. */
const SEARCH_THRESHOLD = 8;

// ── sorting and grouping ────────────────────────────────────────────────────

/**
 * Storage stacks with `unshift`: the list's natural order is recording order,
 * newest first. That is the wrong order — the only thing that matters here is
 * how long until the deadline. With twenty commitments, the one to cancel in
 * three days ended up at the bottom.
 */
const GROUPS = [
  { id: 'week', label: 'within7Days' },
  { id: 'month', label: 'within30Days' },
  { id: 'later', label: 'later' },
  { id: 'passed', label: 'windowExpired' },
  { id: 'closed', label: 'cancelled' },
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
  all: 'all',
  urgent: 'within30Days',
  active: 'active',
  cancelled: 'cancelled',
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
  // Every word must appear: whoever types two terms is narrowing down.
  return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

// ── start-up ────────────────────────────────────────────────────────────────

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

  // A menu that stays open while clicking elsewhere ends up on top of the wrong
  // card: capture phase, so it also covers clicks stopped further down.
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

  // The row waiting for deletion disappears from view at once, but hasn't left
  // storage yet: that is what makes the gesture undoable.
  const alive = list.filter((c) => c.id !== pending?.id);

  $('#c-tools').hidden = alive.length <= SEARCH_THRESHOLD;
  if ($('#c-tools').hidden) {
    // Hiding the filters while leaving them active would make half the list invisible.
    view.query = '';
    view.filter = 'all';
    $('#c-search').value = '';
  }
  paintChips(alive);

  if (!list.length) {
    // The empty state shows what a commitment will look like, with the way to try it.
    $('#commitments-list').innerHTML = `<div class="empty">
      <p>${esc(isWeb
        ? t('whenRecordCommitmentAfterAnalysisCancellation')
        : t('whenGoAheadContractSubscriptionIts'))}</p>
      <div class="c-item example" aria-hidden="true">
        <div class="c-top"><span class="c-name">StreamPro</span><span class="c-amount">599,76 €</span></div>
        <span class="c-state" data-urgency="later">${esc(t('cancelD', { d: '9/9/2028' }))}</span>
        <div class="c-nothing">${esc(t('ifDonTCancelNewPeriod', { x: '479,76 €' }))}</div>
      </div>
      <p class="muted small">${esc(t('example'))} · ${isWeb
        ? `<button class="link" data-try-sample="streaming">${esc(t('tryExample'))}</button>`
        : `<a href="https://antefirma.app/demo/" target="_blank" rel="noopener">${esc(t('tryDemoPage'))}</a>`}</p>
    </div>`;
    return;
  }

  const shown = alive
    .filter((c) => matchesFilter(c, view.filter) && matchesQuery(c, view.query))
    .map((c) => ({ c, state: commitmentState(c) }));

  if (!shown.length) {
    $('#commitments-list').innerHTML = `<div class="empty">
      ${esc(t('noCommitmentMatchesSearch'))}<br>
      <button class="link" data-act="reset-view">${esc(t('showAllCommitments'))}</button>
    </div>`;
    return;
  }

  const buckets = new Map(GROUPS.map((g) => [g.id, []]));
  for (const item of shown) buckets.get(groupOf(item.c, item.state)).push(item);

  const html = GROUPS.map((g) => {
    const items = buckets.get(g.id);
    if (!items.length) return '';
    // Within a group, from the most imminent to the furthest; among windows
    // already closed the opposite counts, the freshest is the one where
    // something can still be tried.
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
    <div class="cap">${esc(tn(s.count, 'totalExposureAcrossNActiveCommitment', 'totalExposureAcrossNActiveCommitments'))}</div>
    ${s.next ? `<div class="next">${esc(t('nextDeadline'))} <strong>${esc(s.next.c.provider || s.next.c.host || t('unnamed'))}</strong> — ${esc(s.next.state.label.toLowerCase())}</div>` : ''}
  `;
}

function renderItem(c, state = commitmentState(c)) {
  const doing = costOfDoingNothing(c);
  const lastChange = (c.changes || []).slice(-1)[0];
  const id = esc(c.id);

  return `
    <div class="c-item" data-commitment="${id}">
      <div class="c-top">
        ${c.provider || c.host
          ? `<span class="c-name">${esc(c.provider || c.host)}</span>`
          : `<button class="c-name c-unnamed" data-act="rename" data-id="${id}" title="${esc(t('rename'))}">${esc(t('unnamed'))} ✎</button>`}
        <span class="c-amount">${c.worstCase != null ? esc(formatMoney(c.worstCase, c.currency)) : ''}</span>
      </div>
      ${subline(c) ? `<div class="c-head">${esc(subline(c))}</div>` : ''}
      <span class="c-state" data-urgency="${esc(state.urgency)}">${esc(state.label)}</span>
      ${doing && state.urgency !== 'done' ? `<div class="c-nothing">${esc(doing.label)}</div>` : ''}
      ${lastChange && lastChange.changed ? `<div class="c-change">⚠️ ${esc(lastChange.summary)}</div>` : ''}
      ${lastChange && !lastChange.changed ? `<div class="c-nothing">✓ ${esc(t('checkedDTermsUnchanged', { d: new Date(lastChange.checkedAt).toLocaleDateString(locale()) }))}</div>` : ''}
      ${state.urgency !== 'done' && c.deadlineAt && !c.inCalendar
        ? `<div class="c-hint">${esc(t('remindersOnlyWorkBrowserOpenAdd'))}</div>`
        : ''}
      <div class="c-actions">
        <button class="strong" data-act="ics" data-id="${id}">${esc(t('calendar'))}</button>
        <button data-act="letter" data-id="${id}">${esc(t('letter'))}</button>
        <div class="c-menu-wrap">
          <button class="c-more" data-act="menu" data-id="${id}"
                  aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('moreActions'))}">⋯</button>
          <div class="c-menu" data-menu="${id}" hidden>${renderMenu(c)}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * The line under the name: what isn't already readable on the right (the total).
 * When it ends or renews, with the notice period; otherwise what leaving costs.
 */
function subline(c) {
  const notice = c.noticeMonths ? ' · ' + t('nDaysNotice', { n: Math.round(c.noticeMonths * 30) }) : '';
  if (c.renewalAt) {
    const d = formatDate(new Date(c.renewalAt));
    return (c.autoRenewal ? t('renewsItselfD', { d }) : t('periodEndsD', { d })) + notice;
  }
  if (c.penalty) return t('leavingEarlyCostsX', { x: formatMoney(c.penalty, c.currency) });
  return '';
}

/** The commitment's name, decided by the user: the one taken from the site can be wrong (Paddle, Stripe…). */
function renameCommitment(id) {
  const c = cache.find((x) => x.id === id);
  if (!c) return;
  closeMenus();
  openModal(t('rename'), `<label class="field"><span>${esc(t('providerServiceName'))}</span>
    <input id="rename-input" maxlength="80" value="${esc(c.provider || '')}" placeholder="${esc(c.host || t('eGHorizonGym'))}"></label>
    <p class="muted small">${esc(t('appearsPanelRemindersCancellationLetter'))}</p>`, [
    { label: t('save'), act: async () => {
      const name = $('#rename-input').value.trim().slice(0, 80);
      await send('UPDATE_COMMITMENT', { id, patch: { provider: name || null } });
      closeModal();
      await load();
    } },
  ]);
  const inp = $('#rename-input');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modal-foot button')?.click(); });
}

function renderMenu(c) {
  const id = esc(c.id);
  return `
    <button data-act="rename" data-id="${id}">${esc(t('rename'))}</button>
    <button data-act="check" data-id="${id}">${esc(t('checkChanges'))}</button>
    <button data-act="proof" data-id="${id}">${esc(t('proofWhatAccepted'))}</button>
    <button data-act="export" data-id="${id}">${esc(t('exportArchive'))}</button>
    ${c.status === 'active'
      ? `<button data-act="cancelled" data-id="${id}">${esc(t('markCancelled'))}</button>`
      : `<button data-act="reactivate" data-id="${id}">${esc(t('reactivate'))}</button>`}
    <button class="danger" data-act="delete-ask" data-id="${id}">${esc(t('deletePermanently'))}</button>
  `;
}

/**
 * The second step of deletion. Not a formality: the full snapshot, the
 * SHA-256 fingerprint that makes it usable as evidence and the deadline plan
 * all disappear here. It must be said in full, and a way out offered —
 * taking the archive away before burning it.
 */
function renderConfirm(c) {
  const id = esc(c.id);
  return `
    <p class="c-confirm-text">
      ${esc(t('deleteX', { x: c.provider || c.host || t('commitment3') }))}
      ${esc(t('proofGoesTooStoredTextSha'))}
    </p>
    <button data-act="export" data-id="${id}">${esc(t('exportBeforeDeleting'))}</button>
    <button class="danger" data-act="delete-confirm" data-id="${id}">${esc(t('yesDelete'))}</button>
    <button class="link" data-act="menu-close" data-id="${id}">${esc(t('cancel'))}</button>
  `;
}

// ── menu ────────────────────────────────────────────────────────────────────

function closeMenus() {
  for (const menu of document.querySelectorAll('.c-menu')) {
    if (menu.hidden) continue;
    menu.hidden = true;
    // The second step doesn't survive closing: reopening the menu must start
    // from the menu, not from the already armed delete confirmation.
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

// ── actions ─────────────────────────────────────────────────────────────────

/** Actions that don't talk to the service worker: no waiting to show. */
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
    if (act === 'rename') renameCommitment(id);
    if (act === 'cancelled') {
      await send('UPDATE_COMMITMENT', { id, patch: { status: 'cancelled' } });
      await load();
    }
    if (act === 'reactivate') {
      await send('UPDATE_COMMITMENT', { id, patch: { status: 'active' } });
      await load();
    }
  } catch (err) {
    openModal(t('operationCouldnTCompleted'), `<div class="status error">${esc(err.message)}</div>`, []);
  } finally {
    // After a `load()` the button is detached from the document: harmless.
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── deletion with a window to change your mind ──────────────────────────────

const UNDO_MS = 8000;

/**
 * `DELETE_COMMITMENT` is irreversible and has no inverse message: the only
 * honest form of "undo" is **not deleting yet**. The card disappears at once,
 * but deletion only starts when the window expires. If the panel is closed
 * before, the commitment stays: the mistake falls on the right side.
 */
function startDelete(id) {
  const c = cache.find((x) => x.id === id);
  if (!c) return;
  closeMenus();
  if (pending) finalizeDelete();          // one pending deletion at a time

  pending = { id, commitment: c, endsAt: Date.now() + UNDO_MS, timer: null, tick: null };
  pending.timer = setTimeout(finalizeDelete, UNDO_MS);
  pending.tick = setInterval(tickUndo, 500);
  render(cache);
  showUndoBar(c);
}

function showUndoBar(c) {
  const bar = $('#undo-bar');
  const name = c.provider || c.host || t('commitment');
  // The bar is written once only: rewriting the HTML every second would take
  // focus away from the "Undo" button exactly from whoever is looking for it
  // with the keyboard.
  bar.innerHTML = `<span>${esc(t('deletedXItsProof', { x: name }))}</span>
    <button class="link" id="undo-delete">${esc(t('cancel'))} (<span id="undo-count">${Math.ceil(UNDO_MS / 1000)}</span>)</button>`;
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
    openModal(t('commitmentCouldnTDeleted'), `<div class="status error">${esc(err.message)}</div>`, []);
    await load();
  }
}

// ── the four actions ────────────────────────────────────────────────────────

/**
 * Letter languages that exist for more than one country say which one; the
 * others use the language's own name (src/i18n/i18n.js).
 */
const VARIANT_LABELS = {
  en: 'English (UK)', 'en-IE': 'English (Ireland)', 'en-MT': 'English (Malta)',
  de: 'Deutsch (Deutschland)', 'de-AT': 'Deutsch (Österreich)', 'de-LU': 'Deutsch (Luxemburg)',
  fr: 'Français (France)', 'fr-BE': 'Français (Belgique)', 'fr-LU': 'Français (Luxembourg)',
  nl: 'Nederlands (Nederland)', 'nl-BE': 'Nederlands (België)',
  pt: 'Português (Portugal)',
  el: 'Ελληνικά (Ελλάδα)', 'el-CY': 'Ελληνικά (Κύπρος)',
};

export async function showLetter(id, kind = null, lang = null) {
  const letter = await send('BUILD_LETTER', { id, kind, lang });
  // Names in their own language, like the language menu in settings; countries that share a language keep their own laws.
  const langs = LETTER_LANGS.flatMap((code) => [[code, VARIANT_LABELS[code] || nameOf(code)], ...Object.entries(VARIANT_LABELS).filter(([k]) => k.startsWith(`${code}-`))])
    .map(([k, label]) => `<option value="${k}" ${k === (letter.variant || letter.lang) ? 'selected' : ''}>${label}</option>`).join('');

  const options = Object.entries(LETTER_LABELS)
    .map(([k, label]) => `<option value="${k}" ${k === letter.kind ? 'selected' : ''}>${esc(t(label))}</option>`)
    .join('');

  openModal(
    t('letterReadySend'),
    `
      <div class="letter-opts"><select id="letter-kind" aria-label="${esc(t('typeLetter'))}">${options}</select>
      <select id="letter-lang" aria-label="${esc(t('letterLanguage'))}" title="${esc(t('languageProviderSend'))}">${langs}</select></div>
      ${firstTime('letter-lang') ? `<p class="hint-first muted small">${esc(t('changeTypeLanguageHereLanguageProvider'))}</p>` : ''}
      <ul class="checklist">${letter.checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <pre id="letter-text">${esc(letter.text)}</pre>
      <p class="muted small"><a href="${helpUrl('lettera', getLang())}" target="_blank" rel="noopener">${esc(t('howSendWhichTypeChoose'))}</a></p>
    `,
    [
      { label: t('copy'), act: (btn) => copy(letter.text, btn) },
      { label: t('downloadTxt'), act: () => download(letter.filename, letter.text, 'text/plain') },
    ]
  );

  $('#letter-kind').addEventListener('change', (e) => showLetter(id, e.target.value, $('#letter-lang').value));
  $('#letter-lang').addEventListener('change', (e) => showLetter(id, $('#letter-kind').value, e.target.value));
}

/** A line of explanation shown only the first times (three openings), then it stops bothering. */
function firstTime(key) {
  try {
    const k = `af-hint-${key}`, n = Number(localStorage.getItem(k) || 0);
    localStorage.setItem(k, String(n + 1));
    return n < 3;
  } catch { return false; }
}

async function downloadIcs(id) {
  const { content, filename } = await send('BUILD_ICS', { id });
  download(filename, content, 'text/calendar');
  // Once in the calendar the deadline no longer depends on us: stop insisting.
  await send('UPDATE_COMMITMENT', { id, patch: { inCalendar: true } });
  await load();
}

async function showChanges(id) {
  const diff = await send('CHECK_CHANGES', { id });
  await load();

  const body = diff.changed
    ? `
      <p class="summary">${esc(diff.summary)}</p>
      ${diff.added.length ? `<p class="muted small"><strong>${esc(t('termsAdded'))}</strong> ${esc(diff.added.join(', '))}</p>` : ''}
      ${diff.removed.length ? `<p class="muted small"><strong>${esc(t('termsRemoved'))}</strong> ${esc(diff.removed.join(', '))}</p>` : ''}
      ${diff.severity === 'major'
        ? `<p class="muted small">${esc(t('unfavourableUnilateralChangeCanLetWithdraw'))}</p>`
        : ''}
    `
    : `<p class="summary">${esc(diff.summary)}</p>`;

  openModal(t('comparisonTermsAccepted'), body,
    diff.severity === 'major' ? [{ label: t('withdrawalLetter'), act: () => showLetter(id, LETTER_KINDS.CHANGE) }] : []);
}

async function showProof(id) {
  const proof = await send('GET_PROOF', { id });
  const when = proof.snapshot?.at ? new Date(proof.snapshot.at).toLocaleString(locale()) : '—';

  openModal(
    t('proofWhatAccepted'),
    `
      ${proof.valid
        ? `<div class="proof-ok">✓ ${esc(t('storedTextMatchesRecordedFingerprint'))}</div>`
        : `<div class="proof-bad">⚠️ ${esc(t('storedTextDoesnTMatchFingerprint'))}</div>`}
      <p class="muted small">${esc(t('acceptedD', { d: when }))} · ${esc(t('nCharacters', { n: proof.snapshot?.chars ?? 0 }))}</p>
      <pre>${esc(proof.attestation)}</pre>
      <p class="muted small">${esc(t('excerpt'))}</p>
      <pre>${esc((proof.snapshot?.excerpt || '').slice(0, 700))}…</pre>
    `,
    [
      { label: t('downloadStatement'), act: () => download(proof.filename, proof.attestation, 'text/plain') },
      {
        label: t('downloadFullText'),
        act: () => download(proof.filename.replace('prova-', 'testo-'), proof.text || '', 'text/plain'),
      },
    ]
  );
}

/**
 * Attestation and full text in a single file: if you are about to delete the
 * proof, downloading it in two pieces from two different menus is a request
 * nobody fulfils.
 */
async function exportArchive(id) {
  const proof = await send('GET_PROOF', { id });
  const c = cache.find((x) => x.id === id) || {};
  const state = commitmentState(c);
  const header = [
    `${t('commitment2')} ${c.provider || c.host || '—'}`,
    c.headline ? `${t('summary')} ${c.headline}` : null,
    c.worstCase != null ? `${t('estimatedFinancialCommitment')} ${formatMoney(c.worstCase, c.currency || 'EUR')}` : null,
    c.deadlineAt ? `${t('cancel2')} ${formatDate(new Date(c.deadlineAt))}` : null,
    c.renewalAt ? `${t('endPeriod')} ${formatDate(new Date(c.renewalAt))}` : null,
    `${t('status')} ${state.label}`,
  ].filter(Boolean).join('\n');

  const body = [
    header,
    '',
    `── ${t('statement')} ──────────────────────────────`,
    proof.attestation || '',
    '',
    `── ${t('fullStoredText')} ──────────────────────────────`,
    proof.text || proof.snapshot?.excerpt || '',
  ].join('\n');

  download((proof.filename || `archivio-${id}.txt`).replace('prova-', 'archivio-'), body, 'text/plain');
}

// ── modal and download ──────────────────────────────────────────────────────

export function openModal(title, bodyHtml, actions = []) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-foot').innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = a.label;
    // The action receives its own button: that is where the outcome must appear.
    btn.addEventListener('click', () => a.act(btn));
    $('#modal-foot').append(btn);
  }
  const close = document.createElement('button');
  close.className = 'link';
  close.textContent = t('close');
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
 * Copying to the clipboard can fail silently (permission denied, document not
 * focused) and succeed just as silently. In both cases the user pressed "Copy"
 * and nothing visible happened: here the button itself says the outcome.
 */
async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    flash(btn, t('copied'), 2000);
  } catch {
    flash(btn, t('copyFailedUseDownloadTxt'), 4000, 'failed');
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

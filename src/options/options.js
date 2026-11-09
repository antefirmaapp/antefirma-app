/**
 * Pagina impostazioni.
 */

import { PROTECTION_LABELS } from '../core/constants.js';

const $ = (s) => document.querySelector(s);

const AREA_HINTS = {
  money: 'Abbonamenti, rinnovi, penali, costi nascosti.',
  privacy: 'Condivisione dati, profilazione, conservazione.',
  ip: 'Licenze sui tuoi contenuti, cessioni di diritti, uso per addestrare AI.',
  freelance: 'Lavori che vendi: foto, testi, codice, progetti.',
  business: 'Dati e documenti dell’azienda, responsabilità, riservatezza.',
  minors: 'Account e dati di figli o familiari minorenni.',
  identity: 'Chiusura arbitraria dell’account, rinuncia a diritti, foro estero.',
};

async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res) throw new Error('Nessuna risposta dal motore.');
  if (!res.ok) throw new Error(res.error);
  return res.result;
}

function buildProfileGrid(profile) {
  $('#profile-grid').innerHTML = Object.entries(PROTECTION_LABELS)
    .map(
      ([key, label]) => `<label class="area">
        <input type="checkbox" data-area="${key}" ${profile[key] ? 'checked' : ''}>
        <span>
          <strong>${label}</strong>
          <em>${AREA_HINTS[key] || ''}</em>
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
 * Il testo delle pagine esce dal browser solo dopo un sì esplicito: qui, o
 * nell'avviso alla prima analisi. La data resta registrata.
 */
function showConsent(at) {
  const box = $('#consent-box');
  if (at) {
    box.className = 'key-status ok';
    box.textContent = `Hai acconsentito all'analisi il ${new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  } else {
    box.className = 'key-status';
    box.textContent = 'Non hai ancora acconsentito: te lo chiederò alla prima analisi.';
  }
  $('#grant-consent').hidden = Boolean(at);
  $('#revoke-consent').hidden = !at;
}

/** Il server risponde? Una prova che non costa analisi. */
async function showServerStatus() {
  const el = $('#server-status');
  try {
    const st = await send('SERVER_STATUS');
    el.textContent = st.ok ? 'raggiungibile' : 'non raggiungibile in questo momento';
    el.style.color = st.ok ? '#14603c' : '#a12a1a';
  } catch (err) {
    el.textContent = `non verificabile: ${err.message}`;
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
    flash('Impostazioni salvate.');
  } catch (err) {
    flash(`Errore: ${err.message}`);
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

// ── eventi ──────────────────────────────────────────────────────────────────

$('#save').addEventListener('click', save);

$('#grant-consent').addEventListener('click', async () => {
  const { remoteConsentAt } = await send('GRANT_CONSENT');
  showConsent(remoteConsentAt);
});

$('#revoke-consent').addEventListener('click', async () => {
  await send('REVOKE_CONSENT');
  showConsent(null);
  flash('Consenso ritirato: nessun testo partirà più verso il server.');
});

$('#clear-cache').addEventListener('click', async () => {
  await send('CLEAR_CACHE');
  flash('Cache svuotata.');
});

$('#clear-history').addEventListener('click', async () => {
  await send('CLEAR_HISTORY');
  flash('Storico cancellato.');
});

if (new URLSearchParams(location.search).has('welcome')) {
  $('#welcome').hidden = false;
}

load();
showServerStatus();

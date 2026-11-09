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

// ── piano ───────────────────────────────────────────────────────────────────

const PLAN_NAMES = { free: 'Gratuito', pro: 'Pro', max: 'Max', team: 'Team' };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function planStatus(text, ok) {
  const el = $('#plan-status');
  el.hidden = !text;
  el.textContent = text || '';
  el.className = `key-status ${ok ? 'ok' : 'err'}`;
}

async function showPlan() {
  let lic;
  try { lic = await send('GET_LICENSE'); } catch (err) { $('#plan-summary').textContent = `Piano non verificabile: ${err.message}`; return; }
  if (lic.error) { $('#plan-summary').textContent = lic.message; $('#plan-buy').hidden = lic.error === 'billing_off'; return; }
  const m = lic.quota?.month;
  const left = m ? ` Restano ${m.remaining} analisi su ${m.limit} questo mese.` : '';
  if (lic.plan === 'free') {
    $('#plan-summary').textContent = `Piano gratuito.${left}`;
  } else {
    const when = lic.cancelAt ? ` Disdetto: resta attivo fino al ${day(lic.cancelAt)}.` : lic.periodEnd ? ` Rinnovo il ${day(lic.periodEnd)}.` : '';
    const where = lic.activations ? ` Attivo su ${lic.activations.used} browser su ${lic.activations.limit}.` : '';
    $('#plan-summary').textContent = `${PLAN_NAMES[lic.plan] || lic.plan}.${left}${where}${when}`;
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
    else planStatus('Pagina di pagamento aperta. Quando hai finito, torna qui: il piano compare da solo.', true);
  } catch (err) { planStatus(err.message, false); }
  b.disabled = false;
}));

$('#plan-activate').addEventListener('click', async () => {
  const key = $('#plan-key').value.trim();
  if (!key) { planStatus('Scrivi la chiave.', false); return; }
  try {
    const r = await send('ACTIVATE_LICENSE', { key });
    if (r.error) { planStatus(r.message, false); return; }
    $('#plan-key').value = '';
    planStatus(`Chiave attivata: ${PLAN_NAMES[r.plan] || r.plan} su questo browser.`, true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

$('#plan-remove').addEventListener('click', async () => {
  if (!confirm('Togliere il piano da questo browser? La chiave resta valida e puoi usarla su un altro browser.')) return;
  try {
    const r = await send('DEACTIVATE_LICENSE');
    if (r.error) { planStatus(r.message, false); return; }
    planStatus('Piano tolto da questo browser.', true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

// Di ritorno dalla pagina di pagamento, il piano si aggiorna da solo.
document.addEventListener('visibilitychange', () => { if (!document.hidden) showPlan(); });

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
showPlan();

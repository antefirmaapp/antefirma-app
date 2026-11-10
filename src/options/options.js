/**
 * Pagina impostazioni.
 */

import { PROTECTION_LABELS } from '../core/constants.js';
import { t, setLang, resolveLang, locale, getLang } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';
import { helpUrl } from '../core/help.js';

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
  if (!res) throw new Error(t('Nessuna risposta dal motore.'));
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
 * Il testo delle pagine esce dal browser solo dopo un sì esplicito: qui, o
 * nell'avviso alla prima analisi. La data resta registrata.
 */
function showConsent(at) {
  const box = $('#consent-box');
  if (at) {
    box.className = 'key-status ok';
    box.textContent = t('Hai acconsentito all’analisi il {d}.', { d: new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) });
  } else {
    box.className = 'key-status';
    box.textContent = t('Non hai ancora acconsentito: te lo chiederò alla prima analisi.');
  }
  $('#grant-consent').hidden = Boolean(at);
  $('#revoke-consent').hidden = !at;
}

/** Il server risponde? Una prova che non costa analisi. */
async function showServerStatus() {
  const el = $('#server-status');
  try {
    const st = await send('SERVER_STATUS');
    el.textContent = st.ok ? t('raggiungibile') : t('non raggiungibile in questo momento');
    el.style.color = st.ok ? '#14603c' : '#a12a1a';
  } catch (err) {
    el.textContent = t('non verificabile: {x}', { x: err.message });
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
    // Cambiata la lingua: la pagina si ridisegna nella nuova.
    if ($('#uiLang').value !== initialLang) { location.reload(); return; }
    flash(t('Impostazioni salvate.'));
  } catch (err) {
    flash(t('Errore: {x}', { x: err.message }));
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
  try { lic = await send('GET_LICENSE'); } catch (err) { $('#plan-summary').textContent = t('Piano non verificabile: {x}', { x: err.message }); return; }
  if (lic.notice) showNotice(lic.notice);
  if (lic.error) { $('#plan-summary').textContent = lic.message; $('#plan-buy').hidden = lic.error === 'billing_off'; return; }
  const m = lic.quota?.month;
  const left = m ? ' ' + t('Restano {a} analisi su {b} questo mese.', { a: m.remaining, b: m.limit }) : '';
  if (lic.plan === 'free') {
    $('#plan-summary').textContent = t('Piano gratuito.') + left;
  } else {
    const when = lic.cancelAt ? ' ' + t('Disdetto: resta attivo fino al {d}.', { d: day(lic.cancelAt) }) : lic.periodEnd ? ' ' + t('Rinnovo il {d}.', { d: day(lic.periodEnd) }) : '';
    const where = lic.activations ? ' ' + t('Attivo su {a} browser su {b}.', { a: lic.activations.used, b: lic.activations.limit }) : '';
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
    else planStatus(t('Pagina di pagamento aperta. Quando hai finito, torna qui: il piano compare da solo.'), true);
  } catch (err) { planStatus(err.message, false); }
  b.disabled = false;
}));

$('#plan-activate').addEventListener('click', async () => {
  const key = $('#plan-key').value.trim();
  if (!key) { planStatus(t('Scrivi la chiave.'), false); return; }
  try {
    const r = await send('ACTIVATE_LICENSE', { key });
    if (r.error) { planStatus(r.message, false); return; }
    $('#plan-key').value = '';
    planStatus(t('Chiave attivata: {x} su questo browser.', { x: planName(r.plan) }), true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

$('#plan-remove').addEventListener('click', async () => {
  if (!confirm(t('Togliere il piano da questo browser? La chiave resta valida e puoi usarla su un altro browser.'))) return;
  try {
    const r = await send('DEACTIVATE_LICENSE');
    if (r.error) { planStatus(r.message, false); return; }
    planStatus(t('Piano tolto da questo browser.'), true);
    showPlan();
  } catch (err) { planStatus(err.message, false); }
});

/** Il messaggio di AnteFirma agli utenti, se ce n'è uno in vigore. */
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
    $('#copy-install-id').addEventListener('click', () => navigator.clipboard?.writeText(installId).then(() => flash(t('Codice copiato.'))));
  } catch { $('#install-id').textContent = '—'; }
}

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
  flash(t('Consenso ritirato: nessun testo partirà più verso il server.'));
});

$('#clear-cache').addEventListener('click', async () => {
  await send('CLEAR_CACHE');
  flash(t('Cache svuotata.'));
});

$('#clear-history').addEventListener('click', async () => {
  await send('CLEAR_HISTORY');
  flash(t('Storico cancellato.'));
});

// La copia dei dati: un file JSON, senza identità dell'installazione né licenza.
$('#export-data').addEventListener('click', async () => {
  try {
    const data = await send('EXPORT_DATA');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `antefirma-dati-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash(t('Dati scaricati.'));
  } catch (err) { flash(err.message); }
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await send('IMPORT_DATA', JSON.parse(await file.text()));
    flash(t('Caricati {a} impegni e {b} voci di storico. Quelli già presenti restano.', { a: r.commitments, b: r.history }));
    load();
  } catch (err) { flash(err instanceof SyntaxError ? t('Il file non è una copia di AnteFirma.') : err.message); }
});

/** La versione web: niente firewall, quindi altri titoli e un'altra spiegazione dell'analisi. */
function adaptForWeb() {
  if (document.documentElement.dataset.web !== '1') return;
  const prot = $('#enabled')?.closest('section')?.querySelector('h2');
  if (prot) prot.textContent = t('Lingua e paese');
  const lead = $('#consent-box')?.closest('section')?.querySelector('p.lead');
  if (lead) lead.textContent = t('Quando premi «Analizza», AnteFirma manda il testo al proprio server, che lo fa leggere a un modello di intelligenza artificiale (Claude, di Anthropic). Il server risponde con le clausole che ti impegnano, ciascuna con la frase esatta del testo, e scarta ogni avviso la cui frase non c’è.');
  // I promemoria della versione web sono notifiche del browser: servono il permesso e la finestra aperta.
  const rem = $('#reminders');
  rem?.addEventListener('change', () => { if (rem.checked && 'Notification' in self && Notification.permission === 'default') Notification.requestPermission(); });
  const em = rem?.closest('label')?.querySelector('em');
  if (em) em.textContent = t('Notifiche a 30, 7 e 1 giorno, quando AnteFirma è aperta. Per non perderle, metti la scadenza anche in calendario.');
}

if (new URLSearchParams(location.search).has('welcome')) {
  $('#welcome').hidden = false;
}

/** Un «?» accanto al titolo di ogni sezione: apre la guida su quell'argomento. */
function addHelpLinks() {
  for (const h of document.querySelectorAll('h2[data-help]')) {
    const a = document.createElement('a');
    a.className = 'help-q'; a.textContent = '?'; a.target = '_blank'; a.rel = 'noopener';
    a.href = helpUrl(h.dataset.help, getLang());
    a.title = a.ariaLabel = t('Aiuto: {s}', { s: h.textContent.trim() });
    h.append(' ', a);
  }
}

// La lingua prima di tutto: la pagina è scritta in italiano e si traduce qui.
let initialLang = 'auto';
(async () => {
  try {
    const s = await send('GET_SETTINGS');
    initialLang = s.uiLang || 'auto';
    setLang(resolveLang(initialLang, chrome.i18n.getUILanguage()));
  } catch { /* resta l'italiano */ }
  translateDom(document.body);
  document.title = t('AnteFirma — Impostazioni');
  adaptForWeb();
  addHelpLinks();
  load();
  showServerStatus();
  showPlan();
  showInstallId();
})();

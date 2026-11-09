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

/** Le impostazioni come stanno sul disco: servono a sapere se il consenso c'è già. */
let saved = null;

async function load() {
  const s = await send('GET_SETTINGS');
  saved = s;

  $('#enabled').checked = s.enabled;
  $('#blockFrom').value = s.blockFrom;
  $('#jurisdiction').value = s.jurisdiction;
  $('#useLLM').checked = s.useLLM;
  $('#provider').value = s.provider;
  $('#model').value = s.model || '';
  $('#apiKey').value = s.apiKey || '';
  $('#llmThreshold').value = s.llmThreshold;
  $('#useLocalModel').checked = s.useLocalModel;
  $('#speculative').checked = s.speculative;
  $('#trackCommitments').checked = s.trackCommitments;
  $('#reminders').checked = s.reminders;
  $('#watchChanges').checked = s.watchChanges;
  $('#watchUsesRemote').checked = s.watchUsesRemote;
  $('#id-name').value = s.identity?.name || '';
  $('#id-email').value = s.identity?.email || '';
  $('#id-address').value = s.identity?.address || '';
  $('#id-customer').value = s.identity?.customerId || '';
  showLocalStatus();
  $('#threshold-val').textContent = s.llmThreshold;
  $('#allowlist').value = (s.allowlist || []).join('\n');

  buildProfileGrid(s.profile);
  syncModelPlaceholder();
}

/**
 * Il testo dei contratti esce dal browser solo dopo un sì esplicito.
 *
 * Prima bastava incollare la chiave: da quel momento il testo cominciava a
 * uscire verso Anthropic o OpenAI senza che fosse mai stato mostrato un
 * consenso. La riga informativa nella pagina è un'informazione, non un atto di
 * accettazione — e la policy del Chrome Web Store chiede l'atto.
 *
 * @returns {Promise<string|null|false>} la data del consenso, `null` se non
 *   serve (nessuna chiave configurata), `false` se l'utente ha rifiutato.
 */
async function ensureRemoteConsent(apiKeyValue, previous) {
  if (!apiKeyValue) return null;
  if (previous) return previous;

  const provider = $('#provider').value === 'openai' ? 'OpenAI' : 'Anthropic';
  const ok = window.confirm(
    'Consenso all\u2019analisi remota\n\n' +
      `Quando il punteggio locale supera la soglia impostata — o quando stai per pagare, abbonarti o firmare — ` +
      `il testo del contratto e il contesto economico della pagina vengono inviati a ${provider} con la tua chiave.\n\n` +
      'Non escono: la cronologia di navigazione, i tuoi dati anagrafici, gli impegni registrati, le prove.\n\n' +
      'Il controllo automatico settimanale resta locale: non usa il modello remoto salvo tua richiesta esplicita.\n\n' +
      'Vuoi attivare l\u2019analisi remota?'
  );
  return ok ? new Date().toISOString() : false;
}

async function save() {
  const btn = $('#save');
  btn.disabled = true;
  try {
    const apiKeyValue = $('#apiKey').value.trim();
    const consent = await ensureRemoteConsent(apiKeyValue, saved?.remoteConsentAt);
    if (consent === false) {
      flash('Analisi remota non attivata: la chiave non è stata salvata.');
      btn.disabled = false;
      return;
    }

    await send('SET_SETTINGS', {
      enabled: $('#enabled').checked,
      blockFrom: $('#blockFrom').value,
      jurisdiction: $('#jurisdiction').value,
      useLLM: $('#useLLM').checked,
      provider: $('#provider').value,
      model: $('#model').value.trim() || defaultModel($('#provider').value),
      apiKey: consent === null ? '' : apiKeyValue,
      remoteConsentAt: consent,
      llmThreshold: Number($('#llmThreshold').value),
      useLocalModel: $('#useLocalModel').checked,
      speculative: $('#speculative').checked,
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

function defaultModel(provider) {
  return provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-4-5';
}

function syncModelPlaceholder() {
  $('#model').placeholder = defaultModel($('#provider').value);
}

/**
 * Il modello integrato non c'è su tutte le installazioni: meglio dirlo qui,
 * chiaramente, che lasciare l'utente a chiedersi perché non succede nulla.
 */
async function showLocalStatus() {
  const el = $('#local-status');
  try {
    const st = await send('LOCAL_MODEL_STATUS');
    el.textContent = st.label;
    el.style.color = st.status === 'available' ? '#14603c' : '';
  } catch (err) {
    el.textContent = `Stato non verificabile: ${err.message}`;
  }
}

// ── eventi ──────────────────────────────────────────────────────────────────

$('#save').addEventListener('click', save);
$('#provider').addEventListener('change', syncModelPlaceholder);
$('#llmThreshold').addEventListener('input', (e) => {
  $('#threshold-val').textContent = e.target.value;
});

$('#toggle-key').addEventListener('click', () => {
  const input = $('#apiKey');
  const shown = input.type === 'text';
  input.type = shown ? 'password' : 'text';
  $('#toggle-key').textContent = shown ? 'Mostra' : 'Nascondi';
});

$('#test-key').addEventListener('click', async () => {
  const btn = $('#test-key');
  const box = $('#key-status');
  btn.disabled = true;
  box.hidden = false;
  box.className = 'key-status';
  box.textContent = 'Provo la chiave su un contratto di esempio…';
  try {
    const out = await send('TEST_API_KEY', {
      provider: $('#provider').value,
      apiKey: $('#apiKey').value.trim(),
      model: $('#model').value.trim() || defaultModel($('#provider').value),
    });
    box.className = 'key-status ok';
    box.textContent = `Funziona. Sul contratto di prova ha riconosciuto ${out.clauses} clausole${out.worstCase ? ` e stimato un impegno di ${out.worstCase} €` : ''}.`;
  } catch (err) {
    box.className = 'key-status err';
    box.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
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

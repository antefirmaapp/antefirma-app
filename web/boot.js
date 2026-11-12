/*
 * AnteFirma web: start-up. Loads the extension's "background" into the page,
 * then registers the service worker that makes the app installable and usable
 * offline too (the analysis itself, of course, needs the network).
 */
import '../src/background/service-worker.js';
import { tIn, resolveLang } from '../src/i18n/index.js';

await chrome.runtime.__ready();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => {});
}

// "Install on this computer": Chrome and Edge offer it; here the button is within reach.
let deferred = null;
const L = {
  it: ['Installa', 'Installa AnteFirma sul computer'], en: ['Install', 'Install AnteFirma on your computer'], es: ['Instalar', 'Instalar AnteFirma en el ordenador'],
  de: ['Installieren', 'AnteFirma auf dem Computer installieren'], fr: ['Installer', 'Installer AnteFirma sur l’ordinateur'], nl: ['Installeren', 'AnteFirma op de computer installeren'],
  pl: ['Zainstaluj', 'Zainstaluj AnteFirma na komputerze'], pt: ['Instalar', 'Instalar o AnteFirma no computador'],
  sv: ['Installera', 'Installera AnteFirma på datorn'], ro: ['Instalează', 'Instalează AnteFirma pe calculator'], cs: ['Instalovat', 'Nainstalovat AnteFirma do počítače'],
  da: ['Installér', 'Installér AnteFirma på computeren'], fi: ['Asenna', 'Asenna AnteFirma tietokoneelle'], no: ['Installer', 'Installer AnteFirma på datamaskinen'],
  sk: ['Inštalovať', 'Nainštalovať AnteFirma do počítača'], hu: ['Telepítés', 'Az AnteFirma telepítése a számítógépre'], el: ['Εγκατάσταση', 'Εγκατάσταση του AnteFirma στον υπολογιστή'],
}[(navigator.language || 'it').slice(0, 2)] || ['Installa', 'Installa AnteFirma sul computer'];
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  if (document.getElementById('web-install')) return;
  const b = document.createElement('button');
  b.id = 'web-install'; b.type = 'button'; b.className = 'web-install'; b.textContent = L[0]; b.title = L[1];
  b.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; b.remove(); });
  (document.querySelector('header.top') || document.body).append(b);
});
addEventListener('appinstalled', () => document.getElementById('web-install')?.remove());

// ── "Open with AnteFirma": a PDF opened from the system reaches the panel ──
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (params) => {
    const handle = params.files?.[0];
    if (!handle) return;
    const file = await handle.getFile();
    const wait = () => (window.__afOpenPdf ? window.__afOpenPdf(file) : setTimeout(wait, 100));
    wait();
  });
}

// ── the empty panel, right of the text, says what will appear ─────────────
// The web app follows the browser language until the panel loads the user's choice.
const LANG = resolveLang('auto', navigator.language || 'it');
const tw = (key) => tIn(LANG, key);
const W = {
  ph: [tw('webPlaceholderTitle'), tw('webPlaceholderText')],
  hi: tw('webWelcomeTitle'), steps: [tw('webWelcomeStep1'), tw('webWelcomeStep2'), tw('webWelcomeStep3')],
  note: tw('webWelcomeNote'), sample: tw('webWelcomeSample'), paste: tw('webWelcomePaste'),
};
const result = document.getElementById('result');
if (result) {
  const ph = () => { if (!result.innerHTML.trim()) result.innerHTML = `<div class="web-placeholder"><strong>${W.ph[0]}</strong>${W.ph[1]}</div>`; };
  ph();
  // When an analysis clears the result, the placeholder must not cover it again.
  new MutationObserver(() => { if (!result.innerHTML.trim() && !document.getElementById('status')?.hidden) return; ph(); }).observe(result, { childList: true });
}

// ── welcome on first opening ────────────────────────────────────────────────
let seen = false;
try { seen = !!localStorage.getItem('af-web-welcome'); } catch { /* storage unavailable */ }
if (!seen && document.getElementById('tab-analyze')) {
  const box = document.createElement('div');
  box.className = 'web-welcome';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'ww-t');
  box.innerHTML = `<div class="card"><h2 id="ww-t">${W.hi}</h2><ol>${W.steps.map((x) => `<li>${x}</li>`).join('')}</ol><p class="note">${W.note}</p>
    <div class="acts"><button class="go" data-w="sample">${W.sample}</button><button data-w="paste">${W.paste}</button></div></div>`;
  const close = (what) => {
    try { localStorage.setItem('af-web-welcome', '1'); } catch { /* same */ }
    box.remove();
    if (what === 'sample') { const go = () => (window.__afSample ? window.__afSample('gym') : setTimeout(go, 100)); go(); }
    else document.getElementById('paste-text')?.focus();
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) close(b.dataset.w); else if (e.target === box) close('paste'); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.isConnected) close('paste'); });
  document.body.append(box);
  box.querySelector('.go').focus();
}

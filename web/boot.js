/*
 * AnteFirma web: avvio. Carica lo «sfondo» dell'estensione nella pagina,
 * poi registra il service worker che rende l'app installabile e usabile
 * anche senza rete (l'analisi, naturalmente, la rete la chiede).
 */
import '../src/background/service-worker.js';

await chrome.runtime.__ready();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => {});
}

// «Installa sul computer»: Chrome ed Edge lo propongono, qui il pulsante è a portata di mano.
let deferred = null;
const L = {
  it: ['Installa', 'Installa AnteFirma sul computer'], en: ['Install', 'Install AnteFirma on your computer'], es: ['Instalar', 'Instalar AnteFirma en el ordenador'],
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

// ── «Apri con AnteFirma»: un PDF aperto dal sistema arriva al pannello ──────
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (params) => {
    const handle = params.files?.[0];
    if (!handle) return;
    const file = await handle.getFile();
    const wait = () => (window.__afOpenPdf ? window.__afOpenPdf(file) : setTimeout(wait, 100));
    wait();
  });
}

// ── il pannello vuoto, a destra del testo, dice che cosa comparirà ─────────
const W = {
  it: { ph: ['Il risultato compare qui', 'Quanto paghi davvero, entro quando disdire, le clausole che ti impegnano con la frase esatta del contratto.'],
    hi: 'Benvenuto in AnteFirma', steps: ['Incolla le condizioni o trascina il PDF del contratto.', 'In pochi secondi vedi quanto paghi davvero, entro quando disdire, come si esce.', 'Registra l’impegno: la scadenza va nel calendario, la lettera di disdetta è già scritta.'],
    note: 'Niente account: i tuoi dati restano su questo computer. L’estensione per Chrome ed Edge (gennaio 2027) fa anche di più: ferma il click sui siti prima che ti impegni.',
    sample: 'Prova con un esempio', paste: 'Incolla il mio contratto' },
  en: { ph: ['The result appears here', 'What you really pay, when to cancel by, the clauses that bind you with the exact sentence from the contract.'],
    hi: 'Welcome to AnteFirma', steps: ['Paste the terms or drop the contract PDF.', 'In a few seconds you see what you really pay, when to cancel by, how to get out.', 'Record the commitment: the deadline goes into your calendar, the cancellation letter is already written.'],
    note: 'No account: your data stays on this computer. The extension for Chrome and Edge (January 2027) does even more: it stops the click on websites before you commit.',
    sample: 'Try an example', paste: 'Paste my contract' },
  es: { ph: ['El resultado aparece aquí', 'Cuánto pagas de verdad, hasta cuándo darte de baja, las cláusulas que te atan con la frase exacta del contrato.'],
    hi: 'Bienvenido a AnteFirma', steps: ['Pega las condiciones o arrastra el PDF del contrato.', 'En unos segundos ves cuánto pagas de verdad, hasta cuándo darte de baja, cómo salir.', 'Guarda el compromiso: la fecha va al calendario, la carta de baja ya está escrita.'],
    note: 'Sin cuenta: tus datos se quedan en este ordenador. La extensión para Chrome y Edge (enero de 2027) hace aún más: detiene el clic en las webs antes de que te comprometas.',
    sample: 'Prueba con un ejemplo', paste: 'Pegar mi contrato' },
}[(navigator.language || 'it').slice(0, 2)] || null;
const L2 = W || { ph: ['', ''] };
const result = document.getElementById('result');
if (result && W) {
  const ph = () => { if (!result.innerHTML.trim()) result.innerHTML = `<div class="web-placeholder"><strong>${L2.ph[0]}</strong>${L2.ph[1]}</div>`; };
  ph();
  // Quando un'analisi svuota il risultato, il segnaposto non deve tornare a coprirla.
  new MutationObserver(() => { if (!result.innerHTML.trim() && !document.getElementById('status')?.hidden) return; ph(); }).observe(result, { childList: true });
}

// ── benvenuto alla prima apertura ──────────────────────────────────────────
let seen = false;
try { seen = !!localStorage.getItem('af-web-welcome'); } catch { /* archivio non disponibile */ }
if (W && !seen && document.getElementById('tab-analyze')) {
  const box = document.createElement('div');
  box.className = 'web-welcome';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'ww-t');
  box.innerHTML = `<div class="card"><h2 id="ww-t">${W.hi}</h2><ol>${W.steps.map((x) => `<li>${x}</li>`).join('')}</ol><p class="note">${W.note}</p>
    <div class="acts"><button class="go" data-w="sample">${W.sample}</button><button data-w="paste">${W.paste}</button></div></div>`;
  const close = (what) => {
    try { localStorage.setItem('af-web-welcome', '1'); } catch { /* idem */ }
    box.remove();
    if (what === 'sample') { const go = () => (window.__afSample ? window.__afSample('gym') : setTimeout(go, 100)); go(); }
    else document.getElementById('paste-text')?.focus();
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) close(b.dataset.w); else if (e.target === box) close('paste'); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.isConnected) close('paste'); });
  document.body.append(box);
  box.querySelector('.go').focus();
}

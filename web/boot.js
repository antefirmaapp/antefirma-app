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

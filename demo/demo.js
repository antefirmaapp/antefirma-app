/**
 * Solo per le pagine di prova: dà un riscontro visibile quando un pulsante
 * viene davvero premuto, così si distingue «l'estensione ha bloccato» da
 * «l'estensione ha lasciato passare». Non c'entra nulla con AnteFirma.
 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-outcome]');
  if (!btn) return;
  const out = btn.parentElement.querySelector('.outcome') || document.querySelector('.outcome');
  if (out) out.textContent = btn.dataset.outcome;
});

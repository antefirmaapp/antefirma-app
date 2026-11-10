/**
 * Demo pages only: gives visible feedback when a button is really pressed, to
 * tell "the extension blocked it" from "the extension let it through". It has
 * nothing to do with AnteFirma itself.
 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-outcome]');
  if (!btn) return;
  const out = btn.parentElement.querySelector('.outcome') || document.querySelector('.outcome');
  if (out) out.textContent = btn.dataset.outcome;
});

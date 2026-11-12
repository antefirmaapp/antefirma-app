// dev.antefirma.app: marks the download that fits the visitor's browser and copies checksums.
// The page works without it: every download and step is already in the HTML.
(() => {
  const ua = navigator.userAgent;
  const isMac = /Macintosh|Mac OS X/.test(ua);
  const browser = /Edg\//.test(ua) ? 'edge'
    : /(Chrome|Chromium|CriOS)\//.test(ua) ? 'chrome'
      : (isMac && /Safari\//.test(ua)) ? 'safari'
        : null;
  const card = browser && document.querySelector(`.card[data-browser="${browser}"]`);
  if (card) {
    card.classList.add('is-rec');
    card.querySelector('.rec').hidden = false;
  }

  const copied = document.body.dataset.copied || 'Copied';
  for (const b of document.querySelectorAll('button[data-copy]')) {
    b.addEventListener('click', async () => {
      const label = b.textContent;
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = copied;
      } catch {
        // Clipboard refused (insecure context or permissions): select the full hash instead.
        const code = b.parentElement.querySelector('code');
        code.textContent = b.dataset.copy;
        getSelection().selectAllChildren(code);
      }
      setTimeout(() => { b.textContent = label; }, 1600);
    });
  }
})();

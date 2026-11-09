/**
 * Namespace condiviso fra i content script e ponte verso il service worker.
 *
 * I content script girano in un "isolated world": il sito non vede queste
 * variabili e non può manomettere l'analisi.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.bridge) return;

  CF.state = CF.state || {
    settings: null,
    lastVerdict: null,
    approvedTargets: new WeakSet(),
    analyzing: false,
  };

  CF.bridge = {
    /** Invia un messaggio al service worker e restituisce il risultato. */
    async send(type, payload) {
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type, payload });
      } catch (err) {
        // Tipico quando l'estensione viene ricaricata mentre la pagina è aperta.
        throw new Error('Estensione non raggiungibile: ricarica la pagina.');
      }
      if (!res) throw new Error('Nessuna risposta dal motore di analisi.');
      if (!res.ok) throw new Error(res.error || 'Errore sconosciuto.');
      return res.result;
    },

    /**
     * Solo il sottoinsieme che serve a decidere se intercettare. La chiave API
     * e i dati anagrafici non entrano mai nella pagina.
     */
    async settings(force = false) {
      if (!force && CF.state.settings) return CF.state.settings;
      CF.state.settings = await this.send('GET_CONTENT_SETTINGS');
      return CF.state.settings;
    },
  };

  CF.util = {
    /** Testo visibile di un elemento, robusto rispetto a icone e span annidati. */
    labelOf(el) {
      if (!el) return '';
      const aria = el.getAttribute?.('aria-label');
      const value = el.value && el.tagName === 'INPUT' ? el.value : '';
      const title = el.getAttribute?.('title');
      const text = (el.innerText || el.textContent || '').trim();
      return (text || value || aria || title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    },

    /** Percorso di elementi dal target alla radice, attraversando gli shadow root. */
    composedPath(event) {
      if (typeof event.composedPath === 'function') return event.composedPath();
      const path = [];
      let node = event.target;
      while (node) {
        path.push(node);
        node = node.parentNode || node.host;
      }
      return path;
    },

    /** Cerca in profondità anche dentro gli shadow root aperti. */
    deepQueryAll(selector, root = document, limit = 400) {
      const out = [];
      const walk = (node) => {
        if (out.length >= limit) return;
        let found = [];
        try {
          found = node.querySelectorAll(selector);
        } catch { /* selettore non valido in questo contesto */ }
        for (const el of found) {
          out.push(el);
          if (out.length >= limit) return;
        }
        const all = node.querySelectorAll ? node.querySelectorAll('*') : [];
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot);
          if (out.length >= limit) return;
        }
      };
      walk(root);
      return out;
    },

    isVisible(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    },

    escapeHtml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
  };
})();

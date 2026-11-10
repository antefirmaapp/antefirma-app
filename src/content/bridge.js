/**
 * A namespace shared by the content scripts, and a bridge to the service worker.
 *
 * Content scripts run in an "isolated world": the site doesn't see these
 * variables and cannot tamper with the analysis.
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
    /** Sends a message to the service worker and returns the result. */
    async send(type, payload) {
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type, payload });
      } catch (err) {
        // Typical when the extension is reloaded while the page is open.
        throw new Error(globalThis.AF_I18N.t('Estensione non raggiungibile: ricarica la pagina.'));
      }
      if (!res) throw new Error(globalThis.AF_I18N.t('Nessuna risposta dal motore di analisi.'));
      if (!res.ok) throw new Error(res.error || globalThis.AF_I18N.t('Errore sconosciuto.'));
      return res.result;
    },

    /**
     * Only the subset needed to decide whether to intercept. The API key and
     * personal details never enter the page.
     */
    async settings(force = false) {
      if (!force && CF.state.settings) return CF.state.settings;
      CF.state.settings = await this.send('GET_CONTENT_SETTINGS');
      // The warning's language: chosen by the extension (settings or browser language).
      globalThis.AF_I18N?.setLang(CF.state.settings?.uiLang);
      return CF.state.settings;
    },
  };

  CF.util = {
    /** An element's visible text, robust against icons and nested spans. */
    labelOf(el) {
      if (!el) return '';
      const aria = el.getAttribute?.('aria-label');
      const value = el.value && el.tagName === 'INPUT' ? el.value : '';
      const title = el.getAttribute?.('title');
      const text = (el.innerText || el.textContent || '').trim();
      return (text || value || aria || title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    },

    /** Path of elements from the target to the root, crossing shadow roots. */
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

    /** Deep search, inside open shadow roots too. */
    deepQueryAll(selector, root = document, limit = 400) {
      const out = [];
      const walk = (node) => {
        if (out.length >= limit) return;
        let found = [];
        try {
          found = node.querySelectorAll(selector);
        } catch { /* selector not valid in this context */ }
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

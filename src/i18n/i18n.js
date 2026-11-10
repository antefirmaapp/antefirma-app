/**
 * The extension's languages: Italian, English, Spanish.
 *
 * Keys are **the Italian sentences themselves**: `t('Torna indietro')` returns
 * the translation in the chosen language, or the Italian sentence if the
 * translation is missing. A forgotten translation shows up (it stays in
 * Italian) instead of breaking something.
 *
 * Placeholders: `t('Disdici entro {n} giorni', { n: 5 })`.
 *
 * The file is a classic script: content scripts (which are not modules) load it,
 * and the service worker, extension pages and tests import it for its side
 * effect. It registers itself on `globalThis.AF_I18N`.
 */
(() => {
  const g = globalThis;
  if (g.AF_I18N) return;
  const LANGS = ['it', 'en', 'es'];
  const LOCALES = { it: 'it-IT', en: 'en-GB', es: 'es-ES' };
  let lang = 'it';

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

  g.AF_I18N = {
    LANGS,
    /** The dictionary: { 'Italian sentence': ['English', 'Spanish'] }. Filled by dict.js. */
    dict: {},
    add(entries) { Object.assign(this.dict, entries); },
    get lang() { return lang; },
    get locale() { return LOCALES[lang]; },
    setLang(l) { lang = LANGS.includes(l) ? l : 'it'; return lang; },
    /** "auto" follows the browser language; outside it/es English is used. */
    resolve(pref, uiLanguage = '') {
      if (LANGS.includes(pref)) return pref;
      const b = String(uiLanguage || '').slice(0, 2).toLowerCase();
      return LANGS.includes(b) ? b : 'en';
    },
    t(it, vars) {
      if (lang !== 'it') {
        const tr = this.dict[it];
        const s = tr && tr[lang === 'en' ? 0 : 1];
        if (s) return fill(s, vars);
      }
      return fill(it, vars);
    },
    /** Singolare o plurale: `tn(n, '{n} giorno', '{n} giorni')`. */
    tn(n, one, many, vars = {}) {
      return this.t(n === 1 ? one : many, { n, ...vars });
    },
  };
})();

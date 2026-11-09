/**
 * Le lingue dell'estensione: italiano (la lingua del codice), inglese, spagnolo.
 *
 * Le chiavi sono **le frasi italiane stesse**: `t('Torna indietro')` restituisce
 * la traduzione nella lingua scelta, o la frase italiana se la traduzione
 * manca. Così il codice resta leggibile e una traduzione dimenticata si vede
 * (resta in italiano) invece di rompere qualcosa.
 *
 * Segnaposti: `t('Disdici entro {n} giorni', { n: 5 })`.
 *
 * Il file è uno script classico: lo caricano i content script (che non sono
 * moduli) e lo importano per effetto collaterale il service worker, le pagine
 * dell'estensione e i test. Si registra su `globalThis.AF_I18N`.
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
    /** Il dizionario: { 'frase italiana': ['english', 'español'] }. Lo riempie dict.js. */
    dict: {},
    add(entries) { Object.assign(this.dict, entries); },
    get lang() { return lang; },
    get locale() { return LOCALES[lang]; },
    setLang(l) { lang = LANGS.includes(l) ? l : 'it'; return lang; },
    /** «auto» segue la lingua del browser; fuori da it/es si usa l'inglese. */
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

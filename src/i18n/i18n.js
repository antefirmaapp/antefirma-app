/**
 * The extension's languages: Italian, English, Spanish.
 *
 * Code refers to texts by English ids: `t('goBack')` returns the text in the
 * chosen language. The texts live in `locales/{it,en,es}.json`;
 * `tools/i18n-build.mjs` turns them into `messages.js`, which content scripts can
 * load (they are not modules and cannot read JSON). A missing translation falls
 * back to Italian, then to the id itself, so it shows up instead of breaking
 * something; `test/i18n.test.mjs` makes sure none is missing.
 *
 * Placeholders: `t('cancelWithinNDays', { n: 5 })`.
 *
 * A classic script: content scripts load it, and the service worker, extension
 * pages and tests import it for its side effect. It registers itself on
 * `globalThis.AF_I18N`.
 */
(() => {
  const g = globalThis;
  if (g.AF_I18N) return;
  const LANGS = ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no', 'sk', 'hu', 'el'];
  const LOCALES = { it: 'it-IT', en: 'en-GB', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT', sv: 'sv-SE', ro: 'ro-RO', cs: 'cs-CZ', da: 'da-DK', fi: 'fi-FI', no: 'nb-NO', sk: 'sk-SK', hu: 'hu-HU', el: 'el-GR' };
  let lang = 'it';
  let byItalian = null;

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

  g.AF_I18N = {
    LANGS,
    /** { it: { id: text }, en: {…}, … }. Filled by messages.js. */
    messages: Object.fromEntries(LANGS.map((l) => [l, {}])),
    add(messages) {
      for (const l of LANGS) Object.assign(this.messages[l], messages[l] || {});
      byItalian = null;
    },
    get lang() { return lang; },
    get locale() { return LOCALES[lang]; },
    setLang(l) { lang = LANGS.includes(l) ? l : 'it'; return lang; },
    /** "auto" follows the browser language; outside it/es English is used. */
    resolve(pref, uiLanguage = '') {
      if (LANGS.includes(pref)) return pref;
      // Norwegian browsers say "nb" (Bokmål) or "nn" (Nynorsk): both read the Norwegian interface.
      const b = String(uiLanguage || '').slice(0, 2).toLowerCase().replace(/^n[bn]$/, 'no');
      return LANGS.includes(b) ? b : 'en';
    },
    /** The text of `id` in a given language, whatever the current one. */
    tIn(l, id, vars) {
      const s = this.messages[l]?.[id] ?? this.messages.it[id] ?? id;
      return fill(s, vars);
    },
    t(id, vars) { return this.tIn(lang, id, vars); },
    /** Singular or plural: `tn(n, 'nDay', 'nDays')`. */
    tn(n, one, many, vars = {}) {
      return this.t(n === 1 ? one : many, { n, ...vars });
    },
    /** The id of an Italian text, for pages written in Italian (see dom.js). */
    idOf(italian) {
      if (!byItalian) byItalian = new Map(Object.entries(this.messages.it).map(([id, s]) => [s, id]));
      return byItalian.get(italian) || null;
    },
  };
})();

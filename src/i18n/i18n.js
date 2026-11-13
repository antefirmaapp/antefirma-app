/**
 * The extension's languages.
 *
 * Code refers to texts by English ids: `t('goBack')` returns the text in the
 * chosen language. The texts live in `locales/<lang>.json`;
 * `tools/i18n-build.mjs` turns them into two generated files:
 *  - `messages.js`, every text in every language, for the service worker, the
 *    extension's pages and the tests;
 *  - `messages-boot.js`, a handful of texts in every language, which is all
 *    content scripts load into a page (they are not modules and cannot read
 *    JSON). The texts of the language in use are fetched from the service
 *    worker when a warning is about to be shown: see `bridge.texts()`.
 * A missing translation falls back to Italian, then to the id itself, so it
 * shows up instead of breaking something; `test/i18n.test.mjs` makes sure none
 * is missing.
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
  /**
   * Every language of the interface, in one place: code, locale for dates and
   * amounts, its own name, and the country whose consumer protections apply
   * by default. Everything else that needs the list reads it from here
   * (src/core/languages.js for modules). Adding a language starts with a row
   * here; `test/i18n.test.mjs` then says what is still missing.
   */
  const LANGUAGES = [
    ['it', 'it-IT', 'Italiano', 'IT'], ['en', 'en-GB', 'English', 'UK'], ['es', 'es-ES', 'Español', 'ES'],
    ['de', 'de-DE', 'Deutsch', 'DE'], ['fr', 'fr-FR', 'Français', 'FR'], ['nl', 'nl-NL', 'Nederlands', 'NL'],
    ['pl', 'pl-PL', 'Polski', 'PL'], ['pt', 'pt-PT', 'Português', 'PT'], ['sv', 'sv-SE', 'Svenska', 'SE'],
    ['ro', 'ro-RO', 'Română', 'RO'], ['cs', 'cs-CZ', 'Čeština', 'CZ'], ['da', 'da-DK', 'Dansk', 'DK'],
    ['fi', 'fi-FI', 'Suomi', 'FI'], ['no', 'nb-NO', 'Norsk', 'NO'], ['sk', 'sk-SK', 'Slovenčina', 'SK'],
    ['hu', 'hu-HU', 'Magyar', 'HU'], ['el', 'el-GR', 'Ελληνικά', 'GR'], ['hr', 'hr-HR', 'Hrvatski', 'HR'],
    ['sl', 'sl-SI', 'Slovenščina', 'SI'], ['bg', 'bg-BG', 'Български', 'BG'], ['lt', 'lt-LT', 'Lietuvių', 'LT'],
    ['lv', 'lv-LV', 'Latviešu', 'LV'], ['et', 'et-EE', 'Eesti', 'EE'],
  ].map(([code, locale, name, country]) => ({ code, locale, name, country }));
  const LANGS = LANGUAGES.map((l) => l.code);
  const LOCALES = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.locale]));
  let lang = 'it';
  let byItalian = null;

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

  g.AF_I18N = {
    LANGS,
    LANGUAGES,
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

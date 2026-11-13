/**
 * The interface's languages, for modules. The table itself is in
 * `src/i18n/i18n.js` (a classic script, because content scripts load it too):
 * this file only gives it names that can be imported.
 */
import '../i18n/i18n.js';

/** [{ code, locale, name, country }]: see i18n.js. */
export const LANGUAGES = globalThis.AF_I18N.LANGUAGES;
export const LANGS = LANGUAGES.map((l) => l.code);
const BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

/** The locale for dates and amounts, e.g. 'no' → 'nb-NO'. */
export const localeOf = (lang) => BY_CODE[lang]?.locale;
/** The language's own name, e.g. 'de' → 'Deutsch'. */
export const nameOf = (lang) => BY_CODE[lang]?.name;
/** The country whose protections apply by default to someone reading in `lang`. */
export const countryOf = (lang) => BY_CODE[lang]?.country;

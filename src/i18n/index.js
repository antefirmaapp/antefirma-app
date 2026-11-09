/** Accesso alle lingue per i moduli (service worker, pagine, test). Vedi i18n.js. */
import './i18n.js';
import './dict.js';

const I = globalThis.AF_I18N;
export const t = (s, vars) => I.t(s, vars);
export const tn = (n, one, many, vars) => I.tn(n, one, many, vars);
export const setLang = (l) => I.setLang(l);
export const getLang = () => I.lang;
export const locale = () => I.locale;
export const resolveLang = (pref, ui) => I.resolve(pref, ui);

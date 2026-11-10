/** Language access for modules (service worker, pages, tests). See i18n.js. */
import './i18n.js';
import './messages.js';

const I = globalThis.AF_I18N;
export const t = (id, vars) => I.t(id, vars);
export const tn = (n, one, many, vars) => I.tn(n, one, many, vars);
export const tIn = (lang, id, vars) => I.tIn(lang, id, vars);
export const setLang = (l) => I.setLang(l);
export const getLang = () => I.lang;
export const locale = () => I.locale;
export const resolveLang = (pref, ui) => I.resolve(pref, ui);

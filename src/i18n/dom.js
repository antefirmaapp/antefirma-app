/**
 * Translates an extension page whose HTML is written in Italian: texts and
 * visible attributes (`placeholder`, `title`, `aria-label`, `alt`).
 *
 * The HTML keeps the Italian text, so pages read naturally and open even before
 * any script runs; each text is looked up in locales/it.json to find its id
 * (spaces normalised), and replaced with that id's text in the current language.
 */
import { t, getLang } from './index.js';

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const I = globalThis.AF_I18N;

/** The current-language text for an Italian page text, or null if it isn't a known text. */
function translated(italian) {
  const id = I.idOf(italian);
  return id ? t(id) : null;
}

export function translateDom(root = document.body) {
  document.documentElement.lang = getLang();
  if (getLang() === 'it') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,textarea,code,[data-no-i18n]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const key = norm(n.nodeValue);
    if (!key) continue;
    const tr = translated(key);
    if (tr != null && tr !== key) {
      const lead = n.nodeValue.match(/^\s*/)[0];
      const trail = n.nodeValue.match(/\s*$/)[0];
      n.nodeValue = lead + tr + trail;
    }
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && norm(v)) { const tr = translated(norm(v)); if (tr != null && tr !== norm(v)) el.setAttribute(a, tr); }
    }
  }
}

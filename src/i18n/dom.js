/**
 * Traduce una pagina HTML scritta in italiano: testi e attributi visibili
 * (`placeholder`, `title`, `aria-label`, `alt`). La chiave è il testo italiano
 * con gli spazi normalizzati, come in t().
 */
import { t, getLang } from './index.js';

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();

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
    const tr = t(key);
    if (tr !== key) {
      const lead = n.nodeValue.match(/^\s*/)[0];
      const trail = n.nodeValue.match(/\s*$/)[0];
      n.nodeValue = lead + tr + trail;
    }
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && norm(v)) { const tr = t(norm(v)); if (tr !== norm(v)) el.setAttribute(a, tr); }
    }
  }
}

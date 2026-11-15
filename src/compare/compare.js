/**
 * Two contracts side by side, on a page of its own: to look at, print, save
 * as a PDF or copy. core/compare.js keeps the two results and builds the rows;
 * nothing is sent anywhere.
 */
import { t, setLang, resolveLang, locale } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';
import { renderVerdict, esc } from '../sidepanel/render.js';
import { readCompare, compareRows, compareSummary, contractName } from '../core/compare.js';

const $ = (s) => document.querySelector(s);

(async () => {
  let settings = {};
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (res?.ok) settings = res.result;
  } catch { /* Italian stays */ }
  setLang(resolveLang(settings.uiLang, chrome.i18n.getUILanguage()));
  translateDom(document.body);
  document.title = t('compareTitle');

  const cmp = await readCompare();
  if (!cmp?.a?.verdict || !cmp?.b?.verdict) {
    $('#empty').hidden = false;
    $('#tools').hidden = true;
    return;
  }
  const a = cmp.a.verdict, b = cmp.b.verdict;
  let names = { a: contractName(a, t('firstContract')), b: contractName(b, t('secondContract')) };
  // Two offers of the same seller: the names alone would not tell them apart.
  if (names.a === names.b) names = { a: `${names.a} (1)`, b: `${names.b} (2)` };

  $('#meta').textContent = new Intl.DateTimeFormat(locale(), { dateStyle: 'long', timeStyle: 'short' }).format(new Date(cmp.b.at));
  $('#summary').textContent = compareSummary(a, b, names, t);
  $('#table').innerHTML = `<table>
    <thead><tr><td></td><th scope="col">${esc(names.a)}</th><th scope="col">${esc(names.b)}</th></tr></thead>
    <tbody>${compareRows(a, b, t).map((r) => `<tr data-row="${r.id}"><th scope="row">${esc(r.label)}</th><td${r.better === 'a' ? ' class="better"' : ''}>${esc(r.a)}</td><td${r.better === 'b' ? ' class="better"' : ''}>${esc(r.b)}</td></tr>`).join('')}</tbody>
  </table>`;
  $('#details').innerHTML = [[names.a, a], [names.b, b]]
    .map(([name, v]) => `<details><summary>${esc(t('compareDetailOfX', { x: name }))}</summary>${renderVerdict(v)}</details>`).join('');
  $('#report').hidden = false;

  // On paper nothing can be opened: every detail is shown.
  $('#print').addEventListener('click', () => { for (const d of document.querySelectorAll('#details details')) d.open = true; window.print(); });
  $('#copy').addEventListener('click', async () => {
    const said = $('#said');
    try {
      const rows = [...document.querySelectorAll('#table tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()).join('\t'));
      await navigator.clipboard.writeText([$('#summary').textContent, '', ...rows].join('\n'));
      said.textContent = t('copied');
    } catch (err) {
      said.textContent = err?.message || String(err);
    }
    said.hidden = false;
  });
})();

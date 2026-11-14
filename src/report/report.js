/**
 * The analysis report: the result of an analysis on a page of its own, to
 * print, save as a PDF or copy as text — to keep, or to send to the seller
 * when contesting a clause.
 *
 * It shows what the panel showed (core/report.js keeps the last result for
 * this page): figures, dates, every clause with the exact sentence it comes
 * from, and the rules that apply. Nothing is sent anywhere.
 */
import { t, setLang, resolveLang, locale } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';
import { renderVerdict } from '../sidepanel/render.js';
import { readReport, reportMeta } from '../core/report.js';

const $ = (s) => document.querySelector(s);

(async () => {
  let settings = {};
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (res?.ok) settings = res.result;
  } catch { /* Italian stays */ }
  setLang(resolveLang(settings.uiLang, chrome.i18n.getUILanguage()));
  translateDom(document.body);
  document.title = t('reportTitle');

  const report = await readReport();
  if (!report?.verdict) {
    $('#empty').hidden = false;
    $('#tools').hidden = true;
    return;
  }
  $('#meta').textContent = reportMeta(report, { t, locale: locale() });
  $('#body').innerHTML = renderVerdict(report.verdict);
  // On paper nothing can be opened: every detail is shown.
  for (const d of document.querySelectorAll('#body details')) d.open = true;
  $('#report').hidden = false;

  $('#print').addEventListener('click', () => window.print());
  $('#copy').addEventListener('click', async () => {
    const said = $('#said');
    try {
      await navigator.clipboard.writeText($('#report').innerText.replace(/\n{3,}/g, '\n\n').trim());
      said.textContent = t('copied');
    } catch (err) {
      said.textContent = err?.message || String(err);
    }
    said.hidden = false;
  });
})();

/** The welcome page: consent and a demo, before the first real click. */
import { t, setLang, resolveLang } from '../i18n/index.js';
import { translateDom } from '../i18n/dom.js';

const $ = (s) => document.querySelector(s);
async function send(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || 'errore');
  return res.result;
}

(async () => {
  let settings = {};
  try { settings = await send('GET_SETTINGS'); } catch { /* resta l'italiano */ }
  setLang(resolveLang(settings.uiLang, chrome.i18n.getUILanguage()));
  translateDom(document.body);
  document.title = t('welcomeAntefirma');
  const done = () => { $('#grant').hidden = true; $('#granted').hidden = false; };
  if (settings.remoteConsentAt) done();
  $('#grant').addEventListener('click', async () => {
    try { await send('GRANT_CONSENT'); done(); $('#s3').scrollIntoView({ behavior: 'smooth' }); } catch (e) { alert(e.message); }
  });
  try {
    const lic = await send('GET_LICENSE');
    if (lic?.quota?.month) $('#left').textContent = lic.quota.month.remaining;
  } catch { /* the default number stays */ }
})();

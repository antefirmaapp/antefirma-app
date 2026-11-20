/** Paid plan: opening the payment and noticing when the plan becomes active. */
import { getLicense, startCheckout, joinWaitlist } from '../core/server.js';
import { API_BASE } from '../core/config.js';
import { t } from '../i18n/index.js';
import { notify } from './commitments.js';
import { showQuotaBadge, withCode, getSettings } from './settings.js';

/**
 * After the payment opens, the plan is checked every minute for half an hour:
 * as soon as it is active, a notification confirms it. Whoever paid must not
 * wonder whether they have to do something else.
 */
export const CHECKOUT_ALARM = 'antefirma-checkout-wait';

export async function watchCheckout() {
  await chrome.storage.local.set({ checkoutUntil: Date.now() + 30 * 60_000 });
  await chrome.alarms.create(CHECKOUT_ALARM, { periodInMinutes: 1 });
}

export async function checkCheckout() {
  const { checkoutUntil = 0 } = await chrome.storage.local.get('checkoutUntil');
  const done = async () => { await chrome.alarms.clear(CHECKOUT_ALARM); await chrome.storage.local.remove('checkoutUntil'); };
  if (Date.now() > checkoutUntil) return done();
  const lic = await getLicense().catch(() => null);
  if (lic && lic.plan && lic.plan !== 'free') {
    await done();
    await showQuotaBadge(null);
    const name = { pro: 'Pro', max: 'Max', team: 'Team' }[lic.plan] || lic.plan;
    await notify({ id: `plan-${Date.now()}`, title: t('xActiveBrowser', { x: name }), message: t('thanksCanClosePaymentPageGo'), commitmentId: null, sticky: false });
  }
}

export async function upgrade() {
  const lic = await withCode(getLicense());
  if (lic?.plan && lic.plan !== 'free') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#piano') });
    return { where: 'options' };
  }
  const r = await withCode(startCheckout('pro', undefined, (await getSettings()).uiLang));
  if (r.error) return r;
  await chrome.tabs.create({ url: r.url });
  await watchCheckout();
  return { where: 'checkout' };
}

// ── before the paid plans are on sale ─────────────────────────────────────────

/**
 * Until the panel opens sales, the server says `sales: false` and the extension
 * shows "Pro coming soon" with a "tell me" switch instead of the payment. The
 * last answer is kept here, so the warning card and the side panel can ask
 * without calling the server.
 */
const SALES_KEY = 'salesState';
const WAIT_KEY = 'waitPro';
/** While someone waits, the plan is checked a few times a day; the alarm goes away once they are told. */
export const WAITPRO_ALARM = 'antefirma-waitpro';
export const PRO_NOTICE_PREFIX = 'pro-';

/** Remembers what the server said; when sales open, whoever was waiting is told, once. */
export async function noteSales(open) {
  if (typeof open !== 'boolean') return;
  await chrome.storage.local.set({ [SALES_KEY]: { open, at: Date.now() } });
  if (open) await tellIfWaiting();
}

/** `{ open, waiting }`: unknown counts as closed, the state the free version starts in. */
export async function salesState() {
  const got = await chrome.storage.local.get([SALES_KEY, WAIT_KEY]);
  return { open: Boolean(got[SALES_KEY]?.open), waiting: Boolean(got[WAIT_KEY]) };
}

export async function setWaitPro(on) {
  const r = await joinWaitlist(Boolean(on));
  // The web app's service worker may be the one to tell, with the app closed: it has no
  // texts of its own, so the words in the person's language are left for it here.
  await chrome.storage.local.set({
    [WAIT_KEY]: Boolean(on),
    waitProNotice: on ? { title: t('proIsHere'), message: t('proIsHereChooseInSettings'), api: API_BASE, url: chrome.runtime.getURL('src/options/options.html#piano') } : null,
  });
  if (on) await chrome.alarms.create(WAITPRO_ALARM, { periodInMinutes: 360 });
  else await chrome.alarms.clear(WAITPRO_ALARM);
  await noteSales(r?.sales);
  return { on: Boolean(on), sales: Boolean(r?.sales) };
}

async function tellIfWaiting() {
  const { [WAIT_KEY]: waiting = false } = await chrome.storage.local.get(WAIT_KEY);
  if (!waiting) return;
  await chrome.storage.local.set({ [WAIT_KEY]: false });
  await chrome.alarms.clear(WAITPRO_ALARM);
  try {
    await chrome.notifications.create(`${PRO_NOTICE_PREFIX}${Date.now()}`, {
      type: 'basic', iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
      title: t('proIsHere'), message: t('proIsHereChooseInSettings'), priority: 1,
    });
  } catch { /* notifications denied: the settings say it anyway */ }
}

/** The alarm while waiting: one question to the server. */
export async function checkWaitPro() {
  const lic = await getLicense().catch(() => null);
  if (lic) await noteSales(lic.sales);
}

/**
 * At start-up (the web app's is every time it opens): while someone waits, the
 * plan is asked again if the last answer is more than three hours old.
 */
export async function checkWaitProIfStale(now = Date.now()) {
  const got = await chrome.storage.local.get([SALES_KEY, WAIT_KEY]);
  if (!got[WAIT_KEY] || now - (got[SALES_KEY]?.at || 0) < 3 * 3_600_000) return;
  await checkWaitPro();
}

export const openPlanSettings = () => chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#piano') });

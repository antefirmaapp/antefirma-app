/** Paid plan: opening the payment and noticing when the plan becomes active. */
import { getLicense, startCheckout } from '../core/server.js';
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

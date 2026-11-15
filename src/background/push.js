/**
 * Reminders when the web app is closed (web version only).
 *
 * The extension does not need this: its alarms wake it while the browser runs,
 * and a push would not reach a browser that is shut either. A web page has no
 * alarms: closed means silent. So, if the person asks for it in the settings,
 * the page gives the server a push address and the hours of the reminders, and
 * the server wakes the browser then (antefirma-server, src/push.js). The
 * wake-up has no content: what to say stays here, in the plan below.
 */
import { getSettings, getCommitments } from '../core/storage.js';
import { buildPushPlan, planTimes } from '../core/push.js';
import { pushRemote } from '../core/server.js';
import { reminderNotice } from './commitments.js';
import { t } from '../i18n/index.js';

/** The server's public key (VAPID): it says who may send to the address. Not a secret. */
export const PUSH_PUBLIC_KEY = 'BPCG9epndtaI4dnRJDYnJlEeUGaSaJ3Gwaibh0lMdjmFtdN03_RZfGRDqwarTEX59h2c0exJnY1ycadhciTVuAg';

export const PLAN_KEY = 'pushPlan';
const SYNC_KEY = 'pushSynced';

/** Can this page ask for push at all? Only the web version, in a browser that has it. */
export function pushSupported() {
  return globalThis.document?.documentElement?.dataset?.web === '1'
    && 'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;
}

const keyBytes = (b64url) => Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * Brings the browser's plan and the server's hours in line with the commitments.
 * Safe to call often: the server is contacted only when the hours changed.
 * @returns {Promise<{ state: 'unsupported'|'off'|'denied'|'on'|'failed', planned?: number }>}
 */
export async function syncPush({ now = Date.now() } = {}) {
  if (!pushSupported()) return { state: 'unsupported' };
  const settings = await getSettings();
  const wanted = Boolean(settings.pushReminders && settings.reminders);
  const { [SYNC_KEY]: synced = null } = await chrome.storage.local.get(SYNC_KEY);
  try {
    // `ready` never settles on a page without a service worker: better to give up than to wait for ever.
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('no service worker')), 8000))]);
    let sub = await reg.pushManager.getSubscription();

    if (!wanted || Notification.permission !== 'granted') {
      // Switched off: the server forgets the address and the hours, the browser its subscription.
      if (synced) { await pushRemote({ endpoint: null, times: [] }); await chrome.storage.local.remove([SYNC_KEY, PLAN_KEY]); }
      if (sub && !wanted) await sub.unsubscribe();
      return { state: wanted ? 'denied' : 'off' };
    }

    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) });
    const plan = buildPushPlan(await getCommitments(), now, reminderNotice,
      (c) => chrome.runtime.getURL(`src/sidepanel/sidepanel.html?tab=commitments&id=${c.id}`));
    // Entries already shown stay marked when the plan is rebuilt.
    const { [PLAN_KEY]: old = null } = await chrome.storage.local.get(PLAN_KEY);
    const shown = new Set((old?.items || []).filter((i) => i.shown).map((i) => i.tag));
    await chrome.storage.local.set({ [PLAN_KEY]: {
      items: plan.map((p) => (shown.has(p.tag) ? { ...p, shown: true } : p)),
      // If the browser is woken with nothing left to show, it still has to say something.
      fallback: { title: t('deadlineComingUp'), message: t('openAntefirmaSeeCommitments'), url: chrome.runtime.getURL('src/sidepanel/sidepanel.html?tab=commitments') },
      icon: chrome.runtime.getURL('src/icons/icon128.png'),
    } });

    const times = planTimes(plan);
    const signature = JSON.stringify([sub.endpoint, times]);
    // Nothing planned and nothing known to the server: nothing to say to it.
    if (signature !== synced && (times.length || synced)) {
      await pushRemote({ endpoint: times.length ? sub.endpoint : null, times });
      await chrome.storage.local.set({ [SYNC_KEY]: signature });
    }
    return { state: 'on', planned: times.length };
  } catch (err) {
    console.warn('[AnteFirma] push reminders:', err?.message);
    return { state: 'failed' };
  }
}
